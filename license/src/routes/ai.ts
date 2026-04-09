import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { requireLicense, type AuthenticatedRequest } from '../middleware/verify-license';
import { getRedis } from '../redis-client';

const router = Router();

const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT_PER_JTI || '20', 10);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const USE_MOCK = !GROQ_API_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmployeeInput {
  id: string;
  name: string;
  notes: string;
}

interface AiScheduleRequest {
  employees: EmployeeInput[];
  businessNotes: string;
  managerNotes: string;
  weekStart: string; // ISO date e.g. "2026-04-13"
}

interface Shift {
  employeeId: string;
  day: number; // 0=Mon … 6=Sun
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  room?: string;
  role?: string;
}

interface AiScheduleResult {
  shifts: Shift[];
  warnings: string[];
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPrompt(body: AiScheduleRequest): { system: string; user: string } {
  const system = `You are a scheduling assistant for LeaveAt.
Given employee availability notes and business requirements, generate a complete Mon–Sun weekly schedule as valid JSON.

Output format (JSON only, no markdown):
{
  "shifts": [
    {
      "employeeId": "<id>",
      "day": 0,
      "startHour": 9,
      "startMinute": 0,
      "endHour": 17,
      "endMinute": 0,
      "room": "<optional>",
      "role": "<optional>"
    }
  ],
  "warnings": ["<constraint violations if any>"],
  "summary": "<brief rationale>"
}

Rules:
- day: 0=Monday … 6=Sunday
- Respect stated availability strictly (hard constraint)
- Best-effort on preferences (soft constraint)
- Flag unresolvable conflicts in warnings[]
- Do not invent employees not in the input list
- Return ONLY the JSON object, no other text`;

  const employeeLines = body.employees
    .map(e => `  - ${e.name} (id: ${e.id}): ${e.notes || 'No notes provided'}`)
    .join('\n');

  const user = `Week of: ${body.weekStart}
Employees:
${employeeLines}

Business requirements:
${body.businessNotes || 'None specified'}

Manager notes:
${body.managerNotes || 'None specified'}`;

  return { system, user };
}

function buildMockResult(employees: EmployeeInput[], weekStart: string): AiScheduleResult {
  const shifts: Shift[] = [];
  employees.forEach((emp, i) => {
    for (let day = 0; day < 5; day++) {
      shifts.push({
        employeeId: emp.id,
        day,
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 0,
      });
    }
  });
  return {
    shifts,
    warnings: ['[MOCK] This is a placeholder schedule — Groq integration not yet configured.'],
    summary: `[MOCK] Generated a default Mon–Fri 9–5 schedule for ${employees.length} employee(s) for the week of ${weekStart}.`,
  };
}

// ── Rate limit ─────────────────────────────────────────────────────────────────

async function checkRateLimit(jti: string): Promise<{ allowed: boolean; resetsAt: number }> {
  const redis = getRedis();
  const key = `ai:ratelimit:${jti}`;

  const count = await redis.incr(key);
  if (count === 1) {
    // First request today: set TTL to expire at next UTC midnight
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const ttl = Math.floor((midnight.getTime() - Date.now()) / 1000);
    await redis.expire(key, ttl);
  }

  const ttl = await redis.ttl(key);
  const resetsAt = Math.floor(Date.now() / 1000) + ttl;

  return { allowed: count <= DAILY_LIMIT, resetsAt };
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
  '/ai/schedule',
  requireLicense,
  [
    body('employees').isArray({ min: 1 }).withMessage('employees must be a non-empty array'),
    body('employees.*.id').isString().notEmpty(),
    body('employees.*.name').isString().notEmpty(),
    body('employees.*.notes').isString(),
    body('businessNotes').isString(),
    body('managerNotes').isString(),
    body('weekStart').isISO8601().withMessage('weekStart must be an ISO date'),
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const license = req.license!;

    // Feature check
    if (!license.features?.includes('ai_scheduling')) {
      res.status(403).json({ error: 'ai_scheduling feature required' });
      return;
    }

    // Rate limit
    let rateLimit: { allowed: boolean; resetsAt: number };
    try {
      rateLimit = await checkRateLimit(license.jti);
    } catch (err) {
      // If Redis is unavailable, allow the request rather than blocking all AI calls
      console.error('[ai] Redis rate limit check failed — allowing request:', err);
      rateLimit = { allowed: true, resetsAt: 0 };
    }

    if (!rateLimit.allowed) {
      res.status(429).json({
        error: 'daily_limit',
        resetsAt: rateLimit.resetsAt,
        message: `Daily AI limit of ${DAILY_LIMIT} requests reached.`,
      });
      return;
    }

    const body = req.body as AiScheduleRequest;

    // Return mock if GROQ_API_KEY not set
    if (USE_MOCK) {
      console.log('[ai] GROQ_API_KEY not set — returning mock schedule');
      res.json(buildMockResult(body.employees, body.weekStart));
      return;
    }

    // Real Groq call
    const { system, user } = buildPrompt(body);

    if (typeof fetch !== 'function') {
      console.error('[ai] fetch() is not available in this Node runtime.');
      res.status(500).json({ error: 'Server does not support fetch() in this runtime.' });
      return;
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        console.error('[ai] Groq error:', response.status, text);
        res.status(502).json({ error: 'AI service unavailable. Please try again.', detail: text.slice(0, 1000) });
        return;
      }

      let data: { choices: { message: { content: string } }[] };
      try {
        data = JSON.parse(text);
      } catch (err: any) {
        console.error('[ai] Failed to parse Groq HTTP response as JSON:', err?.message, text);
        res.status(502).json({ error: 'AI service returned invalid JSON.', detail: text.slice(0, 1000) });
        return;
      }

      const content = data.choices[0]?.message?.content;
      if (!content) {
        console.error('[ai] Groq returned no chat content:', JSON.stringify(data));
        res.status(502).json({ error: 'Empty response from AI service.' });
        return;
      }

      let result: AiScheduleResult;
      try {
        result = JSON.parse(content) as AiScheduleResult;
      } catch (err: any) {
        console.error('[ai] Failed to parse Groq JSON response:', err?.message, content);
        res.status(422).json({ error: 'AI returned an unparseable response. Please try regenerating.', detail: content.slice(0, 1000) });
        return;
      }

      // Basic schema validation
      if (!Array.isArray(result.shifts)) {
        res.status(422).json({ error: 'AI response missing shifts array. Please try regenerating.' });
        return;
      }

      res.json(result);
    } catch (err) {
      console.error('[ai] Unexpected error calling Groq:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
