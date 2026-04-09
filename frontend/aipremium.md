Let me explore the codebase first before planning — I need to understand how the license model, backend, and storage actually work. 

Explore license and backend architecture

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/lib)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/infra)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/services)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/components)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/infra/helm)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/infra/helm/leaveat)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/components/premium-activation)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/components/premium-status)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/index.js#1-1), lines 1 to 200

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/package.json)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/lib/mailer.js)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/lib/registeredAccess.js#1-1), lines 1 to 200

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/docker-compose.yml)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/index.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/config.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/jwt.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/keys.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/db.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/package.json)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/products)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/middleware)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/services/license.service.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/components/premium-activation/premium-activation.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/components/premium-status/premium-status.ts#1-1), lines 1 to 200

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/components/premium-activation/premium-activation.html)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/components/premium-status/premium-status.html)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/infra/helm/leaveat/values.yaml)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/promo.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/checkout.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/restore.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/passkey.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/backup.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/public-key.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/products/index.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/products/leaveat.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/products/types.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/dev.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/middleware/verify-license.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/models)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/secrets/leaveat.example.json)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/models/license.model.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/models/index.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/index.js#200-200), lines 200 to 234

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/routes/webhook.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/license/src/redis-client.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/services/backup.service.ts)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/lib/registeredAccess.js#200-200), lines 200 to 200

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/ENV_VARS.md)

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/lib/registeredAccess.js#200-200), lines 200 to 400

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/backend/lib/registeredAccess.js#400-400), lines 400 to 500

Read [](file:///c%3A/Users/ben/source/repos/sillygooseia-corp/leaveat/frontend/src/app/services/local-storage.service.ts#1-1), lines 1 to 150

Read [](file:///c%3A/Users/ben/AppData/Roaming/Code/User/workspaceStorage/2278906f2946d8cd7c5817ed27cdd272/GitHub.copilot-chat/chat-session-resources/505dc77c-71e1-44e5-9578-ab7d9858b1db/toolu_bdrk_01LL4BXQm35XcQZCnbYuqZCp__vscode-1775602585877/content.txt#1-1), lines 1 to 300

Read [](file:///c%3A/Users/ben/AppData/Roaming/Code/User/workspaceStorage/2278906f2946d8cd7c5817ed27cdd272/GitHub.copilot-chat/chat-session-resources/505dc77c-71e1-44e5-9578-ab7d9858b1db/toolu_bdrk_01LL4BXQm35XcQZCnbYuqZCp__vscode-1775602585877/content.txt#300-300), lines 300 to 700

Read [](file:///c%3A/Users/ben/AppData/Roaming/Code/User/workspaceStorage/2278906f2946d8cd7c5817ed27cdd272/GitHub.copilot-chat/chat-session-resources/505dc77c-71e1-44e5-9578-ab7d9858b1db/toolu_bdrk_01LL4BXQm35XcQZCnbYuqZCp__vscode-1775602585877/content.txt#700-700), lines 700 to 1100

Read [](file:///c%3A/Users/ben/AppData/Roaming/Code/User/workspaceStorage/2278906f2946d8cd7c5817ed27cdd272/GitHub.copilot-chat/chat-session-resources/505dc77c-71e1-44e5-9578-ab7d9858b1db/toolu_bdrk_01LL4BXQm35XcQZCnbYuqZCp__vscode-1775602585877/content.txt#1100-1100), lines 1100 to 1500

Read [](file:///c%3A/Users/ben/AppData/Roaming/Code/User/workspaceStorage/2278906f2946d8cd7c5817ed27cdd272/GitHub.copilot-chat/chat-session-resources/505dc77c-71e1-44e5-9578-ab7d9858b1db/toolu_bdrk_01LL4BXQm35XcQZCnbYuqZCp__vscode-1775602585877/content.txt#1500-1500), lines 1500 to 1893

Good — I now have the complete picture of the system. Let me synthesize this into a concrete plan.

**What the codebase tells me before planning:**
- License = RS256 JWT, device-bound, verified offline against a cached public key. Features are a string array inside the JWT claims (`features: ['unlimited_schedules', 'backup', ...]`)
- Payment = Lemon Squeezy → webhook → new JWT issued → user clicks activation URL
- No user accounts, no user database — only JTI records, promo claims, passkey credentials
- Recovery = passkey + 8-char restore codes + QR. Already works.
- AI call must go through the backend (API key protection + per-JTI rate limiting via Redis which already exists)

---

## Billing Model Decision

**Annual subscription. Single price.**

| | Monthly | **Annual** | Usage |
|---|---|---|---|
| Friction | Payment every 30 days | One decision per year | Must track balance per JTI = needs account |
| Architecture fit | Needs subscription renewal flow | ✅ Aligns with existing 365-day JWTs | Breaks accountless model — Redis balance tied to JTI, must validate server-side on every call |
| Lemon Squeezy | `subscription_payment_success` each month | ✅ `subscription_payment_success` once/year | Not supported natively |
| Philosophy | "SaaS feel" | ✅ "Tool you buy" | Closest to pay-per-use but too complex |

Annual wins. One webhook event per year issues a new JWT. Passkeys/restore codes handle the "I lost my token" problem already.

Suggested price: **$59/year** (low enough to be impulse-buy, covers API costs at typical scheduling usage).

---

## Full Implementation Plan

### Phase 0 — License Model Update *(~2 hours)*

**Goal:** Add `ai_scheduling` as the one real premium feature. All other features become free.

**`leaveat/frontend/src/app/models/license.model.ts`**
- Add `'ai_scheduling'` to `PremiumFeature` union type
- Remove all old feature strings from the type (or keep as deprecated aliases — old promo tokens still carry them, app must not gate on them)

**`leaveat/license/src/products/leaveat.ts`**
- Replace `premiumFeatures` array with `['ai_scheduling']`
- Old promo tokens remain valid (their old features are no longer gated — no harm)
- New paid tokens carry only `['ai_scheduling']`

**Feature gating sweep across the Angular app**
- All existing `hasFeature('unlimited_schedules')` etc. checks → remove gates entirely (features are now free)
- The only remaining `hasFeature()` check in the app = `hasFeature('ai_scheduling')`
- `isPremium()` becomes the shortcut for "has `ai_scheduling`"

---

### Phase 1 — Backend AI Endpoint *(~1 day)*

**New route file:** `leaveat/license/src/routes/ai.ts`

**`POST /api/license/ai/schedule`**

Auth: `requireLicense` middleware (JWT in `Authorization: Bearer ...`)
Feature check: token must include `'ai_scheduling'` in claims

**Request body:**
```typescript
{
  employees: {
    id: string;
    name: string;
    notes: string;          // free text: "mornings only, never Sunday"
  }[];
  businessNotes: string;    // "need 2 in kitchen every night"
  managerNotes: string;     // "avoid scheduling X and Y together"
  weekStart: string;        // ISO date "2026-04-13"
}
```

**Rate limiting (Redis, per JTI):**
- Key: `ai:ratelimit:<jti>`
- Max: **20 requests/day** (resets at UTC midnight via TTL)
- Returns 429 with `{ error: 'daily_limit', resetsAt: <unix> }` on breach
- Enough for weekly scheduling at any realistic usage level

**Prompt construction:** structured system prompt (see Phase 4) + user message assembled from inputs

**OpenAI call:** `POST https://api.openai.com/v1/chat/completions`
- Model: `gpt-4o` (fast, cheap enough at this usage volume)
- `response_format: { type: 'json_object' }` — forces parseable output
- Temperature: 0.3 (deterministic scheduling decisions)

**Response:** parsed schedule JSON handed back to client

**New env vars needed:**
```
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o               # configurable, default gpt-4o
AI_DAILY_LIMIT_PER_JTI=20
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Add to `leaveat/license/.env.example`, `leaveat/secrets/leaveat.example.json`, and Helm `values.yaml`.

---

### Phase 2 — Prompt Engineering *(~half day, iterative)*

The prompt must output JSON that matches the existing `Shift` / `Schedule` models exactly so the Angular app can drop the result directly onto the grid.

**System prompt structure:**
```
You are a scheduling assistant for LeaveAt. 
Given employee availability notes and business requirements, 
generate a complete Mon–Sun weekly schedule as valid JSON.

Output format:
{
  "shifts": [
    {
      "employeeId": "<id>",
      "day": 0,              // 0=Mon ... 6=Sun
      "startHour": 9,
      "startMinute": 0,
      "endHour": 17,
      "endMinute": 0,
      "room": "<optional>",
      "role": "<optional>"
    }
  ],
  "warnings": [             // constraint violations detected
    "Sarah exceeds 25h — reduced to 24h"
  ],
  "summary": "Brief rationale"
}

Rules:
- Respect stated availability strictly (hard constraint)
- Best-effort on preferences (soft constraint)
- Flag unresolvable conflicts in warnings[]
- Do not invent employees not in the input list
```

**User message template:**
```
Week of: {{weekStart}}
Employees:
  {{#each employees}}
  - {{name}} (id: {{id}}): {{notes}}
  {{/each}}

Business requirements:
{{businessNotes}}

Manager notes:
{{managerNotes}}
```

This lives in a `buildAiPrompt()` helper so it can be tuned without touching the route handler.

---

### Phase 3 — Billing / Renewal *(~half day)*

**Using Stripe** (already have an account). Swap is minimal — only `checkout.ts` and `webhook.ts` change.

**Stripe setup:**
- Create a **Recurring Price** (Annual, $59/year) in the Stripe dashboard
- Point Stripe webhook endpoint to `POST /api/license/webhook/stripe`
- Enable events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`

**`checkout.ts` changes:**
- Remove raw Lemon Squeezy `fetch` call
- Add `stripe` npm package (`npm install stripe`)
- Use `stripe.checkout.sessions.create()` with `mode: 'subscription'`, `success_url: FRONTEND_URL/activate?token={CHECKOUT_SESSION_ID}`, `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (replaces `LEMONSQUEEZY_API_KEY` / `STORE_ID` / `VARIANT_ID`)

**`webhook.ts` changes:**
- Rename route to `/webhook/stripe`
- Signature verification: one-liner `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` (replaces manual `crypto.createHmac`)
- Env var: `STRIPE_WEBHOOK_SECRET`

**Events to handle:**

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Issue JWT, record in Postgres (replaces `order_created`) |
| `invoice.payment_succeeded` | Issue new 365-day JWT for same subscription; revoke old JTI (`status='renewed'`) |
| `customer.subscription.deleted` | Set `status='cancelled'` — license expires naturally at its `exp` |

**Token delivery on renewal:**
- Same as before: `activationUrl: FRONTEND_URL/activate?token=...` returned from webhook
- Stripe's built-in renewal receipt email can include a custom link via the Customer Portal, or we add it via `stripe.billing_portal.sessions.create()` post-payment
- Account-free — user gets email with activation link, clicks it, new JWT activates

**`leaveat/license/src/products/leaveat.ts` config update:**
```typescript
checkout: {
  provider: 'stripe',
  secretKey: process.env.STRIPE_SECRET_KEY,
  priceId: process.env.STRIPE_PRICE_ID,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
},
```

---

### Phase 4 — Frontend: AI Scheduling UX *(~1.5 days)*

**New Angular component:** `leaveat/frontend/src/app/components/ai-scheduler/`

Files: `ai-scheduler.ts`, `ai-scheduler.html`, `ai-scheduler.css`

**Integration point:** added to the Work Mode schedule page as a floating/side panel trigger button — "✦ AI Schedule" button appears in the toolbar when `isPremium()` is true.

**UX flow:**

```
[1] Panel opens: "Generate a schedule with AI"
    ├─ Per-employee notes section
    │   Each employee row shows: [Name] [ free-text textarea ]
    │   Pre-populated if employee has saved notes
    ├─ Business requirements textarea (optional)
    ├─ Manager notes textarea (optional)
    └─ [Generate Schedule ▶] button

[2] Loading state (spinner): "LeaveAt is building your schedule..."
    Estimated time shown (typically 3–8s)

[3] Proposed schedule overlay on the grid
    ├─ Semi-transparent view showing AI-proposed shifts
    ├─ Warnings banner if any constraints flagged  
    ├─ AI summary text (collapsible)
    └─ Action bar: [Accept] [Adjust] [↻ Regenerate] [✕ Discard]

[4a] Accept → shifts written to schedule store, panel closes
[4b] Adjust → proposed shifts written as editable draft, user can drag/edit normally
[4c] Regenerate → same inputs re-submitted, new proposal shown
[4d] Discard → overlay removed, original schedule unchanged
```

**New Angular service:** `AiScheduleService`
- `generate(params)` → calls `POST /api/license/ai/schedule` with auth header from `LicenseService.token()`
- Returns typed `AiScheduleResult` with `shifts[]`, `warnings[]`, `summary`
- Stores last draft in localStorage `leaveat:ai-draft`

**Premium gate:** if `!isPremium()`, the "AI Schedule" button shows but opens a soft-gate dialog: "AI Scheduling is a Premium feature. Coming soon — activate your free license to get early access."

---

### Phase 5 — Employee Notes Persistence *(~2 hours)*

AI notes need to survive between sessions.

**New localStorage key:** `leaveat:ai-notes`

Structure:
```typescript
Record<employeeId, string>  // free text per employee
```

Managed by a lightweight `AiNotesService` — no backend needed, stored locally, included in the existing backup blob (it's under the `leaveat:` prefix that `BackupService` already snapshots).

---

### Phase 6 — Feature Flag Migration *(~half day)*

Search the entire frontend codebase for all existing `hasFeature(...)` calls and `isPremium()` gates on non-AI features:
- `unlimited_schedules` → remove gate (schedules are unlimited for everyone)
- `backup` → remove gate (backup is free)
- `history` → remove gate
- `permanent_links` → remove gate
- `templates` → remove gate
- `duplicate` → remove gate
- `registered_access` → remove gate

These gates exist in the schedule store, share service, backup service, and various UI components. Each one becomes unconditional.

Old premium tokens (promo JWTs) still work normally — `isPremium()` returns true, `hasFeature('ai_scheduling')` returns false until they get a new token (which they can't until billing launches). **This is acceptable during the transition period** — promo users display as premium with all features free regardless.

---

### Phase 7 — Rate Limit UX *(~2 hours)*

When the API returns 429 (daily limit hit):
- Show: "You've reached the daily AI limit (20 schedules). Resets at midnight UTC."
- Show `resetsAt` timestamp rendered as local time
- Button stays visible but disabled with a countdown

---

## Dependency & Risk Summary

| Dependency | Risk | Mitigation |
|---|---|---|
| OpenAI API uptime | Medium | Catch errors, show retry message; prompt quality determines UX |
| Stripe webhooks | Low (Stripe account already exists) | Test with `stripe listen --forward-to` CLI in dev |
| Passkey recovery for renewal tokens | None (already built) | Users who lose their token after renewal can use passkey or restore code |
| Prompt output format compliance | Medium — GPT-4o can drift | Use `response_format: json_object` + JSON schema validation on the parsed result; return 422 to client if schema invalid so user can regenerate |
| AI scheduling quality | Product risk | Launch as "beta" label, set expectations; the correction UX (Adjust + Regenerate) absorbs model failures |

---

## Build Order (Recommended)

```
Week 1: Phase 0 (license model) + Phase 1 (AI endpoint skeleton, no Groq yet - return mock JSON)
Week 1: Phase 4 (frontend component against mock endpoint)
Week 2: Phase 2 (prompt engineering, real Groq integration)
Week 2: Phase 5 (employee notes persistence) + Phase 7 (rate limit UX)
Week 3: Phase 3 (billing/renewal webhook extension) + Phase 6 (feature flag sweep)
Week 3: End-to-end testing, prompt tuning, Stripe product + webhook setup
```

The mock-first approach on the backend lets frontend development run in parallel — the AI endpoint contract is defined in Week 1 and both sides build against it independently.