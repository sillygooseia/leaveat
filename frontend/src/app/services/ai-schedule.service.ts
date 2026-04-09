import { Injectable, inject } from '@angular/core';
import { LicenseService } from './license.service';
import type { Shift, CoverageRequirements, DayCoverageRequirement } from '../models';

// ── Request / Response types ──────────────────────────────────────────────────

export interface AiEmployeeInput {
  id: string;
  name: string;
  notes: string; // availability / preferences for this employee
}

export interface AiScheduleRequest {
  employees: AiEmployeeInput[];
  businessNotes: string;
  managerNotes: string;
  weekStart: string; // ISO date YYYY-MM-DD (Monday)
}

/** Shape returned by the backend AI endpoint */
export interface AiScheduleResult {
  shifts: Shift[];
  warnings: string[];
  summary: string;
}

export type AiScheduleError =
  | { type: 'unauthenticated' }
  | { type: 'feature_required' }
  | { type: 'rate_limited'; resetsAt: number }
  | { type: 'service_unavailable'; message: string }
  | { type: 'unknown'; message: string };

export type AiScheduleOutcome =
  | { ok: true; result: AiScheduleResult }
  | { ok: false; error: AiScheduleError };

// ── Draft storage key ─────────────────────────────────────────────────────────

const DRAFT_KEY = 'leaveat:ai-draft';
const NOTES_KEY = 'leaveat:ai-notes'; // Map<employeeId, string>

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AiScheduleService {
  private readonly licenseService = inject(LicenseService);

  async generate(req: AiScheduleRequest): Promise<AiScheduleOutcome> {
    const token = this.licenseService.token();
    if (!token) {
      return { ok: false, error: { type: 'unauthenticated' } };
    }

    let response: Response;
    try {
      response = await fetch('/api/license/ai/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(req),
      });
    } catch {
      return { ok: false, error: { type: 'service_unavailable', message: 'Network error — please check your connection.' } };
    }

    if (response.status === 401 || response.status === 403) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (body.error === 'ai_scheduling feature required') {
        return { ok: false, error: { type: 'feature_required' } };
      }
      return { ok: false, error: { type: 'unauthenticated' } };
    }

    if (response.status === 429) {
      const body = await response.json().catch(() => ({})) as { resetsAt?: number };
      return { ok: false, error: { type: 'rate_limited', resetsAt: body.resetsAt ?? 0 } };
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      return {
        ok: false,
        error: { type: 'service_unavailable', message: body.error ?? `HTTP ${response.status}` },
      };
    }

    const result = await response.json() as AiScheduleResult;

    const normalizeTime = (hour?: number, minute?: number): string | undefined => {
      if (typeof hour !== 'number' || typeof minute !== 'number') return undefined;
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    };

    const weekStart = req.weekStart;
    const stamped: Shift[] = result.shifts.map(s => {
      const startTime = s.startTime ?? normalizeTime((s as any).startHour, (s as any).startMinute);
      const endTime = s.endTime ?? normalizeTime((s as any).endHour, (s as any).endMinute);
      const roomId = s.roomId ?? (s as any).room;

      return {
        ...s,
        id: s.id ?? crypto.randomUUID(),
        weekStartDate: weekStart,
        startTime: startTime ?? s.startTime,
        endTime: endTime ?? s.endTime,
        roomId,
      };
    });

    const outcome: AiScheduleResult = { ...result, shifts: stamped };
    this.saveDraft(outcome);
    return { ok: true, result: outcome };
  }

  // ── Draft ─────────────────────────────────────────────────────────────────

  saveDraft(result: AiScheduleResult): void {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(result));
    } catch { /* storage full — non-fatal */ }
  }

  getDraft(): AiScheduleResult | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) as AiScheduleResult : null;
    } catch {
      return null;
    }
  }

  clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY);
  }

  // ── Per-employee notes ────────────────────────────────────────────────────

  getNotesMap(): Record<string, string> {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      return raw ? JSON.parse(raw) as Record<string, string> : {};
    } catch {
      return {};
    }
  }

  setNote(employeeId: string, note: string): void {
    const map = this.getNotesMap();
    map[employeeId] = note;
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(map));
    } catch { /* non-fatal */ }
  }
}

// ── Coverage → human-readable text ───────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Converts a CoverageRequirements object into a plain-language summary
 * suitable for injection into the AI "business requirements" prompt field.
 * Returns an empty string when coverage is disabled or unset.
 */
export function coverageToText(coverage: CoverageRequirements | null | undefined): string {
  if (!coverage?.enabled) return '';

  const lines: string[] = ['Staffing requirements:'];
  if (coverage.disabledDays?.length) {
    const closedList = coverage.disabledDays
      .sort((a, b) => a - b)
      .map(d => DAY_NAMES[d] ?? `Day ${d}`);
    lines.push(`- Closed on ${closedList.join(', ')}.`);
  }

  if (coverage.mode === 'simple') {
    lines.push(`- Minimum ${coverage.simpleMinStaff ?? 1} staff at all times.`);
  }

  if (coverage.mode === 'time-based' && coverage.dayRequirements?.length) {
    for (const day of coverage.dayRequirements as DayCoverageRequirement[]) {
      const dayName = DAY_NAMES[day.day] ?? `Day ${day.day}`;
      for (const slot of day.timeSlots) {
        const role = slot.requiredRole ? ` (${slot.requiredRole})` : '';
        lines.push(`- ${dayName} ${slot.startTime}–${slot.endTime}: min ${slot.minStaff} staff${role}.`);
      }
    }
  }

  if (coverage.mode === 'room-ratio' && coverage.rooms?.length) {
    for (const room of coverage.rooms) {
      const role = room.requiredRole ? ` (${room.requiredRole})` : '';
      lines.push(
        `- ${room.name}: ${room.capacity} children enrolled, ratio 1:${room.ratioChildren}${role} → min ${Math.ceil(room.capacity / room.ratioChildren)} staff.`
      );
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
}
