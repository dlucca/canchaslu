# Public Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public read-only availability endpoint + mobile-first agenda page with auto-refresh, applying schedules + exceptions − reservations − blocked_slots and resolving prices via pricing_rules. No reservation creation.

**Architecture:** Pure logic in `src/lib/{timezone,pricing,availability,format,api-error}.ts` (zero I/O, fully unit-testable). DB queries in `src/db/queries/`. Route Handlers in `src/app/api/`. Server Component at `/` does SSR; client components handle selectors, polling, and URL sync.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript strict, Drizzle ORM, postgres-js, Vitest, Tailwind, shadcn (button + sonner toaster), Zod for input validation, `Intl.DateTimeFormat` for locale formatting (no date library).

**Reference docs:**
- Spec: [docs/superpowers/specs/2026-05-19-public-availability-design.md](../specs/2026-05-19-public-availability-design.md)
- Prior sub-project: [setup + schema](../plans/2026-05-19-setup-schema.md) (merged to main)
- PRD: [PRD-Canchas-Futbol-v3.md](../../../PRD-Canchas-Futbol-v3.md) (§7 UX flow, §11 anticipation rules, §12 pricing)

**Branch:** `feat/public-availability` (already created from main).

---

## File Structure

Files this plan creates or modifies:

```
canchaslu/
├── package.json                          # MODIFY: split test scripts; add shadcn deps as needed
├── src/
│   ├── app/
│   │   ├── page.tsx                      # MODIFY: replace placeholder with agenda
│   │   ├── layout.tsx                    # MODIFY: mount <Toaster />
│   │   └── api/
│   │       ├── courts/route.ts           # CREATE
│   │       └── availability/route.ts     # CREATE
│   ├── lib/
│   │   ├── constants.ts                  # CREATE: MIN_ANTICIPATION_MIN, MAX_ANTICIPATION_DAYS, REFRESH_INTERVAL_MS, ERROR_RETRY_MS
│   │   ├── timezone.ts                   # CREATE: dateToVenueRangeUtc(date, tz)
│   │   ├── pricing.ts                    # CREATE: resolvePriceCents(base, rules, slot, dow)
│   │   ├── availability.ts               # CREATE: computeAvailableSlots(inputs)
│   │   ├── format.ts                     # CREATE: formatLocalTime, formatCurrency
│   │   └── api-error.ts                  # CREATE: jsonError(status, body) helper
│   ├── db/
│   │   └── queries/
│   │       ├── courts.ts                 # CREATE: fetchActiveCourts()
│   │       └── availability.ts           # CREATE: fetchAvailabilityInputs(courtId, date)
│   └── components/
│       ├── ui/
│       │   ├── button.tsx                # CREATE: re-add via `shadcn add button`
│       │   └── sonner.tsx                # CREATE: re-add via `shadcn add sonner`
│       └── agenda/
│           ├── AgendaView.tsx            # CREATE: client orchestrator (state + polling + URL sync)
│           ├── CourtSelect.tsx           # CREATE: native <select>
│           ├── DateSelect.tsx            # CREATE: native <input type="date">
│           └── SlotCard.tsx              # CREATE: presentational button
└── tests/
    ├── lib/
    │   ├── timezone.test.ts              # CREATE
    │   ├── pricing.test.ts               # CREATE
    │   └── availability.test.ts          # CREATE
    └── api/
        └── availability.test.ts          # CREATE (integration, requires DATABASE_URL_TEST)
```

Boundaries: `src/lib/*` never imports `src/db/*`. `src/db/queries/*` returns raw schema entities, never formats for UI. Route handlers orchestrate (query → pure logic → JSON). Components only consume the API or props.

---

## Pre-requisite

The repo is on branch `feat/public-availability` (already created from `main`). All work happens on this branch.

`.env` must have `DATABASE_URL` and `DIRECT_URL` set (already done in sub-project 1). The integration test (Task 14b) needs `DATABASE_URL_TEST` — that's optional; skip it if you don't have a test DB.

---

## Task 1: Re-add shadcn primitives, split test scripts

**Files:**
- Modify: `package.json`
- Create: `src/components/ui/button.tsx`, `src/components/ui/sonner.tsx` (via shadcn CLI)

- [ ] **Step 1: Re-add Button component**

```bash
cd /Users/dlucca/Projects/software/canchaslu
pnpm dlx shadcn@latest add button --yes
```

Expected: creates `src/components/ui/button.tsx`. If it asks about overwriting `components.json` or other files, answer no — keep existing config.

- [ ] **Step 2: Add Sonner toaster**

```bash
pnpm dlx shadcn@latest add sonner --yes
```

Expected: creates `src/components/ui/sonner.tsx`, installs `sonner` and `next-themes` packages.

- [ ] **Step 3: Split test scripts**

Open `package.json`, find the `scripts` block, replace:

```json
"test": "vitest run",
"test:watch": "vitest"
```

with:

```json
"test": "vitest run tests/lib",
"test:integration": "vitest run tests/db tests/api",
"test:watch": "vitest tests/lib"
```

Rationale: unit tests (`tests/lib`) are pure and run anywhere. Integration tests (`tests/db`, `tests/api`) need `DATABASE_URL_TEST` and are opt-in.

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm build
```

Expected: both succeed. `tests/lib/` is empty so `pnpm test` will report "no test files found" — that's fine.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: re-add shadcn button + sonner, split test scripts"
```

---

## Task 2: Constants

**Files:**
- Create: `src/lib/constants.ts`

- [ ] **Step 1: Create the file**

`/Users/dlucca/Projects/software/canchaslu/src/lib/constants.ts`:

```ts
export const MIN_ANTICIPATION_MIN = 30;
export const MAX_ANTICIPATION_DAYS = 30;
export const REFRESH_INTERVAL_MS = 30_000;
export const ERROR_RETRY_MS = 5_000;
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(lib): public availability constants"
```

---

## Task 3: Timezone helper — failing test first

**Files:**
- Create: `tests/lib/timezone.test.ts`

- [ ] **Step 1: Write the test**

`/Users/dlucca/Projects/software/canchaslu/tests/lib/timezone.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { dateToVenueRangeUtc } from '@/lib/timezone';

describe('dateToVenueRangeUtc', () => {
  it('converts a date in America/Argentina/Buenos_Aires to its UTC range', () => {
    // AR is UTC-3 year-round (no DST). 2026-06-15 in AR = 2026-06-15T03:00:00Z .. 2026-06-16T03:00:00Z.
    const { startUtc, endUtc } = dateToVenueRangeUtc('2026-06-15', 'America/Argentina/Buenos_Aires');

    expect(startUtc.toISOString()).toBe('2026-06-15T03:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-06-16T03:00:00.000Z');
  });

  it('converts a date in UTC tz to itself', () => {
    const { startUtc, endUtc } = dateToVenueRangeUtc('2026-06-15', 'UTC');

    expect(startUtc.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-06-16T00:00:00.000Z');
  });

  it('handles a DST-affected timezone correctly (America/New_York spring forward)', () => {
    // 2026-03-08 in NY: DST starts at 02:00 local. The day still has 23 hours but the local→UTC offset changes mid-day.
    // 2026-03-08 00:00 EST (UTC-5) = 2026-03-08T05:00:00Z. End: 2026-03-09 00:00 EDT (UTC-4) = 2026-03-09T04:00:00Z.
    const { startUtc, endUtc } = dateToVenueRangeUtc('2026-03-08', 'America/New_York');

    expect(startUtc.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test tests/lib/timezone.test.ts
```

Expected: FAIL with "Failed to resolve import @/lib/timezone" or similar.

---

## Task 4: Timezone helper — implementation

**Files:**
- Create: `src/lib/timezone.ts`

- [ ] **Step 1: Implement**

`/Users/dlucca/Projects/software/canchaslu/src/lib/timezone.ts`:

```ts
/**
 * Returns the [00:00, 00:00 next-day) UTC range corresponding to a calendar
 * date in the given IANA timezone. DST-safe: derives the offset from the
 * actual timezone rules at the moment of midnight on the given date.
 */
export function dateToVenueRangeUtc(
  date: string,
  venueTimezone: string,
): { startUtc: Date; endUtc: Date } {
  const startUtc = localMidnightToUtc(date, venueTimezone);
  const nextDay = addDaysIso(date, 1);
  const endUtc = localMidnightToUtc(nextDay, venueTimezone);
  return { startUtc, endUtc };
}

function localMidnightToUtc(date: string, tz: string): Date {
  // Strategy: take a UTC instant at the same wall-clock components, then ask
  // Intl what that instant looks like in the target tz. The delta tells us
  // the UTC offset to subtract.
  const [y, m, d] = date.split('-').map((p) => Number.parseInt(p, 10)) as [number, number, number];
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcGuess));

  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;

  const localY = Number.parseInt(lookup.year!, 10);
  const localM = Number.parseInt(lookup.month!, 10);
  const localD = Number.parseInt(lookup.day!, 10);
  const localH = Number.parseInt(lookup.hour === '24' ? '0' : lookup.hour!, 10);
  const localMin = Number.parseInt(lookup.minute!, 10);
  const localS = Number.parseInt(lookup.second!, 10);

  const localAsUtc = Date.UTC(localY, localM - 1, localD, localH, localMin, localS, 0);
  const offsetMs = localAsUtc - utcGuess;
  return new Date(utcGuess - offsetMs);
}

function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map((p) => Number.parseInt(p, 10)) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  const next = new Date(t + days * 86_400_000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
pnpm test tests/lib/timezone.test.ts
```

Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(lib): dateToVenueRangeUtc with DST-safe offset"
```

---

## Task 5: Pricing helper — failing test first

**Files:**
- Create: `tests/lib/pricing.test.ts`

- [ ] **Step 1: Write the test**

`/Users/dlucca/Projects/software/canchaslu/tests/lib/pricing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { resolvePriceCents, type PricingRuleInput } from '@/lib/pricing';

const baseRule: PricingRuleInput = {
  dayOfWeek: null,
  startTime: null,
  endTime: null,
  multiplier: 1,
  priority: 0,
  active: true,
};

describe('resolvePriceCents', () => {
  it('returns base price when no rules match', () => {
    expect(resolvePriceCents(1_000_000, [], '19:00', 3)).toBe(1_000_000);
  });

  it('applies a day-of-week rule when day matches', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_500_000);
  });

  it('does not apply a day-of-week rule when day does not match', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 4)).toBe(1_000_000);
  });

  it('applies a time-range rule only when local time is inside [start, end)', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, startTime: '19:00', endTime: '23:00', multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '18:59', 3)).toBe(1_000_000);
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_500_000);
    expect(resolvePriceCents(1_000_000, rules, '22:59', 3)).toBe(1_500_000);
    expect(resolvePriceCents(1_000_000, rules, '23:00', 3)).toBe(1_000_000);
  });

  it('picks the highest-priority rule among multiple matches', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.3, priority: 5 },
      { ...baseRule, dayOfWeek: 3, startTime: '19:00', endTime: '23:00', multiplier: 1.5, priority: 10 },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_500_000);
  });

  it('ignores inactive rules', () => {
    const rules: PricingRuleInput[] = [
      { ...baseRule, dayOfWeek: 3, multiplier: 1.5, priority: 10, active: false },
    ];
    expect(resolvePriceCents(1_000_000, rules, '19:00', 3)).toBe(1_000_000);
  });

  it('rounds the final price to the nearest cent', () => {
    const rules: PricingRuleInput[] = [{ ...baseRule, multiplier: 1.33, priority: 1 }];
    expect(resolvePriceCents(1_000_000, rules, '10:00', 3)).toBe(1_330_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test tests/lib/pricing.test.ts
```

Expected: FAIL with module resolution error.

---

## Task 6: Pricing helper — implementation

**Files:**
- Create: `src/lib/pricing.ts`

- [ ] **Step 1: Implement**

`/Users/dlucca/Projects/software/canchaslu/src/lib/pricing.ts`:

```ts
export type PricingRuleInput = {
  dayOfWeek: number | null;
  startTime: string | null; // 'HH:mm' or 'HH:mm:ss'
  endTime: string | null;
  multiplier: number;
  priority: number;
  active: boolean;
};

/**
 * Resolves the price for a slot by finding the highest-priority active pricing
 * rule that matches the slot's day-of-week and local start time. Each rule
 * criterion (dayOfWeek, start/endTime) is independent: null acts as wildcard.
 *
 * @param basePriceCents court.base_price_cents
 * @param rules          pricing rules already filtered to one court
 * @param localStart     slot local start time as 'HH:mm' (24h)
 * @param dayOfWeek      0=Sun .. 6=Sat in venue timezone
 */
export function resolvePriceCents(
  basePriceCents: number,
  rules: PricingRuleInput[],
  localStart: string,
  dayOfWeek: number,
): number {
  const startHm = normalizeHm(localStart);
  const matches = rules.filter((r) => r.active && ruleMatches(r, startHm, dayOfWeek));
  if (matches.length === 0) return basePriceCents;
  matches.sort((a, b) => b.priority - a.priority);
  const winner = matches[0]!;
  return Math.round(basePriceCents * winner.multiplier);
}

function ruleMatches(rule: PricingRuleInput, localStart: string, dayOfWeek: number): boolean {
  if (rule.dayOfWeek !== null && rule.dayOfWeek !== dayOfWeek) return false;

  const hasStart = rule.startTime !== null;
  const hasEnd = rule.endTime !== null;
  if (hasStart && hasEnd) {
    const s = normalizeHm(rule.startTime!);
    const e = normalizeHm(rule.endTime!);
    if (localStart < s || localStart >= e) return false;
  } else if (hasStart || hasEnd) {
    // Half-defined time range is invalid; skip rather than match incorrectly.
    return false;
  }
  return true;
}

function normalizeHm(input: string): string {
  // Postgres 'time' columns serialize as 'HH:MM:SS'. We compare on 'HH:mm'.
  return input.slice(0, 5);
}
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
pnpm test tests/lib/pricing.test.ts
```

Expected: all 7 pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(lib): resolvePriceCents with priority-based rule matching"
```

---

## Task 7: Availability helper — failing tests first

**Files:**
- Create: `tests/lib/availability.test.ts`

- [ ] **Step 1: Write the test**

`/Users/dlucca/Projects/software/canchaslu/tests/lib/availability.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { computeAvailableSlots, type AvailabilityInputs } from '@/lib/availability';

const baseInputs: AvailabilityInputs = {
  court: { id: 'c1', slotDurationMin: 60, basePriceCents: 1_000_000 },
  schedule: { opensAt: '09:00:00', closesAt: '12:00:00' },
  exception: null,
  reservations: [],
  blockedSlots: [],
  pricingRules: [],
  date: '2026-06-15', // Monday
  venueTimezone: 'America/Argentina/Buenos_Aires',
  now: new Date('2026-06-01T00:00:00.000Z'), // far before the date, so no anticipation filter
};

describe('computeAvailableSlots', () => {
  it('generates correct slots for a normal day', () => {
    const slots = computeAvailableSlots(baseInputs);
    expect(slots).toHaveLength(3);
    expect(slots[0]!.localStart).toBe('09:00');
    expect(slots[0]!.localEnd).toBe('10:00');
    expect(slots[2]!.localStart).toBe('11:00');
    expect(slots.every((s) => s.available)).toBe(true);
    expect(slots.every((s) => s.priceCents === 1_000_000)).toBe(true);
  });

  it('returns [] when exception.closed is true', () => {
    const inputs = {
      ...baseInputs,
      exception: { closed: true, opensAt: null, closesAt: null },
    };
    expect(computeAvailableSlots(inputs)).toEqual([]);
  });

  it('uses exception times when present', () => {
    const inputs: AvailabilityInputs = {
      ...baseInputs,
      exception: { closed: false, opensAt: '20:00:00', closesAt: '22:00:00' },
    };
    const slots = computeAvailableSlots(inputs);
    expect(slots).toHaveLength(2);
    expect(slots[0]!.localStart).toBe('20:00');
    expect(slots[1]!.localStart).toBe('21:00');
  });

  it('returns [] when schedule is null and no exception override', () => {
    const inputs = { ...baseInputs, schedule: null };
    expect(computeAvailableSlots(inputs)).toEqual([]);
  });

  it('filters out slots that start before now + MIN_ANTICIPATION_MIN', () => {
    // 2026-06-15 09:00 AR = 2026-06-15T12:00:00Z. now is 11:45Z → 15min gap → filtered.
    // 10:00 AR = 13:00Z → 75min gap → kept.
    const inputs: AvailabilityInputs = {
      ...baseInputs,
      now: new Date('2026-06-15T11:45:00.000Z'),
    };
    const slots = computeAvailableSlots(inputs);
    expect(slots.map((s) => s.localStart)).toEqual(['10:00', '11:00']);
  });

  it('filters out slots that start more than MAX_ANTICIPATION_DAYS ahead', () => {
    // now is far in the past; date is 2026-06-15. Slots start ~2026-06-15.
    // If MAX_ANTICIPATION_DAYS=30 and now is 2026-05-01, the gap is ~45 days → all filtered.
    const inputs: AvailabilityInputs = {
      ...baseInputs,
      now: new Date('2026-05-01T00:00:00.000Z'),
    };
    expect(computeAvailableSlots(inputs)).toEqual([]);
  });

  it('marks a slot unavailable when overlapping an active reservation', () => {
    // 10:00-11:00 AR = 13:00Z-14:00Z. Reserve 13:30Z-14:30Z → overlaps slot 10:00 and 11:00.
    const inputs: AvailabilityInputs = {
      ...baseInputs,
      reservations: [
        {
          startsAt: new Date('2026-06-15T13:30:00.000Z'),
          endsAt: new Date('2026-06-15T14:30:00.000Z'),
        },
      ],
    };
    const slots = computeAvailableSlots(inputs);
    expect(slots.map((s) => ({ t: s.localStart, a: s.available }))).toEqual([
      { t: '09:00', a: true },
      { t: '10:00', a: false },
      { t: '11:00', a: false },
    ]);
  });

  it('marks a slot unavailable when overlapping a blocked_slot', () => {
    const inputs: AvailabilityInputs = {
      ...baseInputs,
      blockedSlots: [
        {
          startsAt: new Date('2026-06-15T13:00:00.000Z'),
          endsAt: new Date('2026-06-15T14:00:00.000Z'),
        },
      ],
    };
    const slots = computeAvailableSlots(inputs);
    expect(slots.find((s) => s.localStart === '10:00')!.available).toBe(false);
    expect(slots.find((s) => s.localStart === '09:00')!.available).toBe(true);
  });

  it('applies pricing rules to slots', () => {
    const inputs: AvailabilityInputs = {
      ...baseInputs,
      // dayOfWeek for 2026-06-15 in AR = Monday (1)
      pricingRules: [
        {
          dayOfWeek: 1,
          startTime: '10:00',
          endTime: '12:00',
          multiplier: 1.5,
          priority: 10,
          active: true,
        },
      ],
    };
    const slots = computeAvailableSlots(inputs);
    expect(slots.find((s) => s.localStart === '09:00')!.priceCents).toBe(1_000_000);
    expect(slots.find((s) => s.localStart === '10:00')!.priceCents).toBe(1_500_000);
    expect(slots.find((s) => s.localStart === '11:00')!.priceCents).toBe(1_500_000);
  });

  it('discards an incomplete trailing slot if duration does not divide the window', () => {
    const inputs: AvailabilityInputs = {
      ...baseInputs,
      schedule: { opensAt: '09:00:00', closesAt: '10:30:00' }, // 90 min window, 60 min slots
    };
    const slots = computeAvailableSlots(inputs);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.localStart).toBe('09:00');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test tests/lib/availability.test.ts
```

Expected: FAIL with module resolution error.

---

## Task 8: Availability helper — implementation

**Files:**
- Create: `src/lib/availability.ts`

- [ ] **Step 1: Implement**

`/Users/dlucca/Projects/software/canchaslu/src/lib/availability.ts`:

```ts
import { MAX_ANTICIPATION_DAYS, MIN_ANTICIPATION_MIN } from './constants';
import { resolvePriceCents, type PricingRuleInput } from './pricing';
import { dateToVenueRangeUtc } from './timezone';

export type AvailabilityInputs = {
  court: { id: string; slotDurationMin: number; basePriceCents: number };
  schedule: { opensAt: string; closesAt: string } | null;
  exception: { closed: boolean; opensAt: string | null; closesAt: string | null } | null;
  reservations: Array<{ startsAt: Date; endsAt: Date }>;
  blockedSlots: Array<{ startsAt: Date; endsAt: Date }>;
  pricingRules: PricingRuleInput[];
  date: string;
  venueTimezone: string;
  now: Date;
};

export type Slot = {
  startsAtUtc: Date;
  endsAtUtc: Date;
  localStart: string;
  localEnd: string;
  priceCents: number;
  available: boolean;
};

export function computeAvailableSlots(inputs: AvailabilityInputs): Slot[] {
  const window = resolveOperatingWindow(inputs.schedule, inputs.exception);
  if (!window) return [];

  const dayOfWeek = computeDayOfWeek(inputs.date, inputs.venueTimezone);
  const rawSlots = generateRawSlots(
    inputs.date,
    window,
    inputs.court.slotDurationMin,
    inputs.venueTimezone,
  );

  const minStart = inputs.now.getTime() + MIN_ANTICIPATION_MIN * 60_000;
  const maxStart = inputs.now.getTime() + MAX_ANTICIPATION_DAYS * 86_400_000;

  const filtered = rawSlots.filter(
    (s) => s.startsAtUtc.getTime() >= minStart && s.startsAtUtc.getTime() <= maxStart,
  );

  return filtered.map((s) => {
    const available =
      !overlapsAny(s, inputs.reservations) && !overlapsAny(s, inputs.blockedSlots);
    const priceCents = resolvePriceCents(
      inputs.court.basePriceCents,
      inputs.pricingRules,
      s.localStart,
      dayOfWeek,
    );
    return { ...s, available, priceCents };
  });
}

function resolveOperatingWindow(
  schedule: AvailabilityInputs['schedule'],
  exception: AvailabilityInputs['exception'],
): { opensAt: string; closesAt: string } | null {
  if (exception?.closed) return null;
  if (exception && exception.opensAt && exception.closesAt) {
    return { opensAt: exception.opensAt, closesAt: exception.closesAt };
  }
  if (!schedule) return null;
  return schedule;
}

function generateRawSlots(
  date: string,
  window: { opensAt: string; closesAt: string },
  durationMin: number,
  venueTimezone: string,
): Array<Pick<Slot, 'startsAtUtc' | 'endsAtUtc' | 'localStart' | 'localEnd'>> {
  const opens = parseHm(window.opensAt);
  const closes = parseHm(window.closesAt);
  const windowMin = (closes.h - opens.h) * 60 + (closes.m - opens.m);
  const count = Math.floor(windowMin / durationMin);

  const { startUtc: dayStartUtc } = dateToVenueRangeUtc(date, venueTimezone);
  const openOffsetMs = (opens.h * 60 + opens.m) * 60_000;
  const slotMs = durationMin * 60_000;

  const out: Array<Pick<Slot, 'startsAtUtc' | 'endsAtUtc' | 'localStart' | 'localEnd'>> = [];
  for (let i = 0; i < count; i++) {
    const startUtcMs = dayStartUtc.getTime() + openOffsetMs + i * slotMs;
    const endUtcMs = startUtcMs + slotMs;
    out.push({
      startsAtUtc: new Date(startUtcMs),
      endsAtUtc: new Date(endUtcMs),
      localStart: formatHm(opens.h * 60 + opens.m + i * durationMin),
      localEnd: formatHm(opens.h * 60 + opens.m + (i + 1) * durationMin),
    });
  }
  return out;
}

function overlapsAny(
  slot: { startsAtUtc: Date; endsAtUtc: Date },
  ranges: Array<{ startsAt: Date; endsAt: Date }>,
): boolean {
  return ranges.some((r) => r.startsAt < slot.endsAtUtc && r.endsAt > slot.startsAtUtc);
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':');
  return { h: Number.parseInt(h!, 10), m: Number.parseInt(m!, 10) };
}

function formatHm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function computeDayOfWeek(date: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const wk = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wk] ?? 0;
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
pnpm test tests/lib/availability.test.ts
```

Expected: all 10 pass.

- [ ] **Step 3: Run full lib test suite**

```bash
pnpm test
```

Expected: 20 tests passed (3 timezone + 7 pricing + 10 availability).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lib): computeAvailableSlots pure function"
```

---

## Task 9: Formatting helpers

**Files:**
- Create: `src/lib/format.ts`

These are tiny pure helpers used by components. No dedicated tests (covered by component smoke).

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/lib/format.ts`:

```ts
/**
 * Formats an integer-cents amount as a localized currency string,
 * e.g. 1500000 + 'ARS' → '$15.000'.
 *
 * Uses Intl.NumberFormat es-AR which produces non-breaking-space thousands
 * separators ('.') and integer-only display for ARS.
 */
export function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(lib): formatCurrency helper"
```

---

## Task 10: API error helper

**Files:**
- Create: `src/lib/api-error.ts`

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/lib/api-error.ts`:

```ts
import { NextResponse } from 'next/server';
import type { ZodIssue } from 'zod';

export function jsonValidationError(issues: ZodIssue[]): NextResponse {
  return NextResponse.json(
    { error: 'validation_failed', issues },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function jsonNotFound(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function jsonInternalError(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'internal', requestId },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(lib): standardized API error responses"
```

---

## Task 11: Court query

**Files:**
- Create: `src/db/queries/courts.ts`

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/db/queries/courts.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { courts, venues } from '@/db/schema';

export type ActiveCourt = {
  id: string;
  name: string;
  type: string;
  surface: string;
  covered: boolean;
  venueId: string;
};

export async function fetchActiveCourts(): Promise<ActiveCourt[]> {
  const rows = await db
    .select({
      id: courts.id,
      name: courts.name,
      type: courts.type,
      surface: courts.surface,
      covered: courts.covered,
      venueId: courts.venueId,
    })
    .from(courts)
    .innerJoin(venues, eq(courts.venueId, venues.id))
    .where(eq(courts.active, true))
    .orderBy(asc(courts.name));
  return rows;
}

export async function fetchActiveCourtById(id: string): Promise<ActiveCourt | null> {
  const rows = await db
    .select({
      id: courts.id,
      name: courts.name,
      type: courts.type,
      surface: courts.surface,
      covered: courts.covered,
      venueId: courts.venueId,
    })
    .from(courts)
    .where(and(eq(courts.id, id), eq(courts.active, true)))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(db): fetchActiveCourts and fetchActiveCourtById queries"
```

---

## Task 12: Availability query

**Files:**
- Create: `src/db/queries/availability.ts`

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/db/queries/availability.ts`:

```ts
import { and, eq, gt, inArray, lt } from 'drizzle-orm';

import { db } from '@/db';
import {
  blockedSlots,
  courts,
  courtSchedules,
  pricingRules,
  reservations,
  scheduleExceptions,
  venues,
} from '@/db/schema';
import { dateToVenueRangeUtc } from '@/lib/timezone';

export type AvailabilityQueryResult = {
  court: { id: string; slotDurationMin: number; basePriceCents: number };
  venue: { id: string; timezone: string; currency: string };
  schedule: { opensAt: string; closesAt: string } | null;
  exception: { closed: boolean; opensAt: string | null; closesAt: string | null } | null;
  reservations: Array<{ startsAt: Date; endsAt: Date }>;
  blockedSlots: Array<{ startsAt: Date; endsAt: Date }>;
  pricingRules: Array<{
    dayOfWeek: number | null;
    startTime: string | null;
    endTime: string | null;
    multiplier: number;
    priority: number;
    active: boolean;
  }>;
};

/**
 * Returns all inputs needed by computeAvailableSlots for a given court+date.
 * Returns null if the court does not exist or is inactive.
 */
export async function fetchAvailabilityInputs(
  courtId: string,
  date: string,
): Promise<AvailabilityQueryResult | null> {
  const courtRow = await db
    .select({
      id: courts.id,
      slotDurationMin: courts.slotDurationMin,
      basePriceCents: courts.basePriceCents,
      venueId: courts.venueId,
      active: courts.active,
      venueTimezone: venues.timezone,
      venueCurrency: venues.currency,
    })
    .from(courts)
    .innerJoin(venues, eq(courts.venueId, venues.id))
    .where(and(eq(courts.id, courtId), eq(courts.active, true)))
    .limit(1);

  const court = courtRow[0];
  if (!court) return null;

  const { startUtc, endUtc } = dateToVenueRangeUtc(date, court.venueTimezone);
  const dayOfWeek = dayOfWeekInTz(date, court.venueTimezone);

  const [scheduleRows, exceptionRows, reservationRows, blockedRows, pricingRows] = await Promise.all(
    [
      db
        .select({ opensAt: courtSchedules.opensAt, closesAt: courtSchedules.closesAt })
        .from(courtSchedules)
        .where(
          and(
            eq(courtSchedules.courtId, courtId),
            eq(courtSchedules.dayOfWeek, dayOfWeek),
            eq(courtSchedules.active, true),
          ),
        )
        .limit(1),
      db
        .select({
          closed: scheduleExceptions.closed,
          opensAt: scheduleExceptions.opensAt,
          closesAt: scheduleExceptions.closesAt,
        })
        .from(scheduleExceptions)
        .where(and(eq(scheduleExceptions.courtId, courtId), eq(scheduleExceptions.date, date)))
        .limit(1),
      db
        .select({ startsAt: reservations.startsAt, endsAt: reservations.endsAt })
        .from(reservations)
        .where(
          and(
            eq(reservations.courtId, courtId),
            inArray(reservations.status, ['pending', 'confirmed']),
            lt(reservations.startsAt, endUtc),
            gt(reservations.endsAt, startUtc),
          ),
        ),
      db
        .select({ startsAt: blockedSlots.startsAt, endsAt: blockedSlots.endsAt })
        .from(blockedSlots)
        .where(
          and(
            eq(blockedSlots.courtId, courtId),
            lt(blockedSlots.startsAt, endUtc),
            gt(blockedSlots.endsAt, startUtc),
          ),
        ),
      db
        .select({
          dayOfWeek: pricingRules.dayOfWeek,
          startTime: pricingRules.startTime,
          endTime: pricingRules.endTime,
          multiplier: pricingRules.multiplier,
          priority: pricingRules.priority,
          active: pricingRules.active,
        })
        .from(pricingRules)
        .where(and(eq(pricingRules.courtId, courtId), eq(pricingRules.active, true))),
    ],
  );

  return {
    court: {
      id: court.id,
      slotDurationMin: court.slotDurationMin,
      basePriceCents: court.basePriceCents,
    },
    venue: { id: court.venueId, timezone: court.venueTimezone, currency: court.venueCurrency },
    schedule: scheduleRows[0] ?? null,
    exception: exceptionRows[0] ?? null,
    reservations: reservationRows,
    blockedSlots: blockedRows,
    pricingRules: pricingRows.map((r) => ({ ...r, multiplier: Number.parseFloat(r.multiplier) })),
  };
}

function dayOfWeekInTz(date: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const wk = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wk] ?? 0;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(db): fetchAvailabilityInputs query"
```

---

## Task 13: `/api/courts` route

**Files:**
- Create: `src/app/api/courts/route.ts`

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/app/api/courts/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { fetchActiveCourts } from '@/db/queries/courts';
import { jsonInternalError, newRequestId } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  const requestId = newRequestId();
  try {
    const courts = await fetchActiveCourts();
    return NextResponse.json(
      {
        courts: courts.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          surface: c.surface,
          covered: c.covered,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', requestId, route: '/api/courts', err: String(err) }));
    return jsonInternalError(requestId);
  }
}
```

- [ ] **Step 2: Manual smoke test**

```bash
pnpm dev &
sleep 5
curl -s http://localhost:3000/api/courts | head -c 500
kill %1
```

Expected: JSON with 2 courts from the seed (`Cancha 1` and `Cancha 2`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): GET /api/courts returns active courts"
```

---

## Task 14: `/api/availability` route

**Files:**
- Create: `src/app/api/availability/route.ts`

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/app/api/availability/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { fetchAvailabilityInputs } from '@/db/queries/availability';
import {
  jsonInternalError,
  jsonNotFound,
  jsonValidationError,
  newRequestId,
} from '@/lib/api-error';
import { computeAvailableSlots } from '@/lib/availability';
import { MAX_ANTICIPATION_DAYS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  courtId: z.string().uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()), 'invalid date'),
});

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      courtId: url.searchParams.get('courtId'),
      date: url.searchParams.get('date'),
    });
    if (!parsed.success) return jsonValidationError(parsed.error.issues);

    const { courtId, date } = parsed.data;

    // Reject dates outside [today, today + MAX_ANTICIPATION_DAYS] in UTC.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const max = new Date(today.getTime() + MAX_ANTICIPATION_DAYS * 86_400_000);
    const requested = new Date(`${date}T00:00:00Z`);
    if (requested < today || requested > max) {
      return jsonValidationError([
        {
          code: 'custom',
          path: ['date'],
          message: `date must be between ${today.toISOString().slice(0, 10)} and ${max.toISOString().slice(0, 10)}`,
        },
      ]);
    }

    const inputs = await fetchAvailabilityInputs(courtId, date);
    if (!inputs) return jsonNotFound('court_not_found');

    const slots = computeAvailableSlots({
      court: inputs.court,
      schedule: inputs.schedule,
      exception: inputs.exception,
      reservations: inputs.reservations,
      blockedSlots: inputs.blockedSlots,
      pricingRules: inputs.pricingRules,
      date,
      venueTimezone: inputs.venue.timezone,
      now: new Date(),
    });

    return NextResponse.json(
      {
        courtId,
        date,
        timezone: inputs.venue.timezone,
        currency: inputs.venue.currency,
        slots: slots.map((s) => ({
          startsAtUtc: s.startsAtUtc.toISOString(),
          endsAtUtc: s.endsAtUtc.toISOString(),
          localStart: s.localStart,
          localEnd: s.localEnd,
          priceCents: s.priceCents,
          available: s.available,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', requestId, route: '/api/availability', err: String(err) }),
    );
    return jsonInternalError(requestId);
  }
}
```

- [ ] **Step 2: Manual smoke test**

Grab a court id from the seed first:

```bash
pnpm tsx -e "
import 'dotenv/config';
import postgres from 'postgres';
(async () => {
  const sql = postgres(process.env.DIRECT_URL, { max: 1, prepare: false });
  const rows = await sql\`SELECT id, name FROM courts ORDER BY name\`;
  console.log(JSON.stringify(rows));
  await sql.end();
})();
"
```

Note the first id. Then:

```bash
pnpm dev &
sleep 5
TODAY=$(date +%Y-%m-%d)
COURT_ID=<paste-the-id-from-above>
curl -s "http://localhost:3000/api/availability?courtId=$COURT_ID&date=$TODAY" | head -c 800
kill %1
```

Expected: JSON with `slots` array. Each slot should have `localStart`, `localEnd`, `priceCents`, `available`. If today is L–V and the requested time falls in 19–23, those slots should show priceCents = `1500000 * 1.5 = 2250000` (Cancha 1) or `2500000 * 1.5 = 3750000` (Cancha 2).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): GET /api/availability with Zod validation and pure logic"
```

---

## Task 14b (optional): Integration test for `/api/availability`

**Skip this task if `DATABASE_URL_TEST` is not configured.** It can be done later when a second Supabase project is available.

**Files:**
- Create: `tests/api/availability.test.ts`

- [ ] **Step 1: Write the test**

`/Users/dlucca/Projects/software/canchaslu/tests/api/availability.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { courts } from '@/db/schema';
import { testDb } from '../db/_setup';

import { GET } from '@/app/api/availability/route';

describe('GET /api/availability', () => {
  it('returns slots for a seeded court on a Monday', async () => {
    // The test DB is reset and re-migrated in _setup, but does NOT run the seed.
    // We insert a minimal venue + court + schedule + pricing rule inline.
    const { venues, courtSchedules, pricingRules } = await import('@/db/schema');

    const [venue] = await testDb
      .insert(venues)
      .values({ name: `test-${crypto.randomUUID()}`, address: '-' })
      .returning();

    const [court] = await testDb
      .insert(courts)
      .values({
        venueId: venue!.id,
        name: 'Test Court',
        type: 'f5',
        surface: 'sintetico',
        basePriceCents: 1_000_000,
      })
      .returning();

    // Schedule 9:00-12:00 every day
    for (let dow = 0; dow <= 6; dow++) {
      await testDb
        .insert(courtSchedules)
        .values({ courtId: court!.id, dayOfWeek: dow, opensAt: '09:00', closesAt: '12:00' });
    }
    // Peak rule Mon 10:00-12:00 multiplier 1.5
    await testDb.insert(pricingRules).values({
      courtId: court!.id,
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '12:00',
      multiplier: '1.50',
      priority: 10,
    });

    // Find next Monday >= today + 2 days (to avoid anticipation filter)
    const monday = nextMonday();

    const url = `http://localhost:3000/api/availability?courtId=${court!.id}&date=${monday}`;
    const req = new Request(url);
    // @ts-expect-error -- NextRequest is structurally compatible with Request for this handler's usage
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.courtId).toBe(court!.id);
    expect(body.date).toBe(monday);
    expect(body.slots).toHaveLength(3);

    const slot10 = body.slots.find((s: { localStart: string }) => s.localStart === '10:00');
    expect(slot10.priceCents).toBe(1_500_000);
  });
});

function nextMonday(): string {
  const now = new Date();
  now.setUTCHours(12, 0, 0, 0);
  for (let i = 2; i < 9; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    if (d.getUTCDay() === 1) return d.toISOString().slice(0, 10);
  }
  throw new Error('no monday found');
}
```

- [ ] **Step 2: Run (only if `DATABASE_URL_TEST` is set)**

```bash
pnpm test:integration
```

Expected: 1 passed (plus the 6 pre-existing tests from sub-project 1, total 7).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(api): integration test for /api/availability"
```

---

## Task 15: SlotCard component

**Files:**
- Create: `src/components/agenda/SlotCard.tsx`

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/components/agenda/SlotCard.tsx`:

```tsx
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export type SlotProps = {
  localStart: string;
  localEnd: string;
  priceCents: number;
  available: boolean;
  currency: string;
  onSelect: () => void;
};

export function SlotCard({ localStart, localEnd, priceCents, available, currency, onSelect }: SlotProps) {
  return (
    <button
      type="button"
      onClick={available ? onSelect : undefined}
      disabled={!available}
      className={cn(
        'w-full min-h-14 px-4 py-3 rounded-lg border flex items-center justify-between text-left transition-colors',
        available
          ? 'border-border bg-card hover:bg-accent active:bg-accent/80'
          : 'border-border bg-muted opacity-60 cursor-not-allowed',
      )}
      aria-disabled={!available}
    >
      <span className="font-medium tabular-nums">
        {localStart} – {localEnd}
      </span>
      <span className={cn('text-sm', available ? 'font-semibold' : 'text-muted-foreground')}>
        {available ? formatCurrency(priceCents, currency) : 'No disponible'}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(ui): SlotCard component"
```

---

## Task 16: CourtSelect + DateSelect

**Files:**
- Create: `src/components/agenda/CourtSelect.tsx`, `src/components/agenda/DateSelect.tsx`

- [ ] **Step 1: Create CourtSelect**

`/Users/dlucca/Projects/software/canchaslu/src/components/agenda/CourtSelect.tsx`:

```tsx
'use client';

export type Court = { id: string; name: string };

export function CourtSelect({
  courts,
  value,
  onChange,
}: {
  courts: Court[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className="text-xs text-muted-foreground">Cancha</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Seleccionar cancha"
      >
        {courts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 2: Create DateSelect**

`/Users/dlucca/Projects/software/canchaslu/src/components/agenda/DateSelect.tsx`:

```tsx
'use client';

import { MAX_ANTICIPATION_DAYS } from '@/lib/constants';

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function maxIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + MAX_ANTICIPATION_DAYS * 86_400_000).toISOString().slice(0, 10);
}

export function DateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 flex-1">
      <span className="text-xs text-muted-foreground">Fecha</span>
      <input
        type="date"
        value={value}
        min={todayIso()}
        max={maxIso()}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Seleccionar fecha"
      />
    </label>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(ui): CourtSelect and DateSelect components"
```

---

## Task 17: AgendaView client orchestrator

**Files:**
- Create: `src/components/agenda/AgendaView.tsx`

- [ ] **Step 1: Create**

`/Users/dlucca/Projects/software/canchaslu/src/components/agenda/AgendaView.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { REFRESH_INTERVAL_MS, ERROR_RETRY_MS } from '@/lib/constants';

import { CourtSelect, type Court } from './CourtSelect';
import { DateSelect } from './DateSelect';
import { SlotCard } from './SlotCard';

type Slot = {
  startsAtUtc: string;
  endsAtUtc: string;
  localStart: string;
  localEnd: string;
  priceCents: number;
  available: boolean;
};

export type AvailabilityResponse = {
  courtId: string;
  date: string;
  timezone: string;
  currency: string;
  slots: Slot[];
};

export function AgendaView({
  initialCourts,
  initialAvailability,
  initialCourtId,
  initialDate,
}: {
  initialCourts: Court[];
  initialAvailability: AvailabilityResponse;
  initialCourtId: string;
  initialDate: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [courtId, setCourtId] = useState(initialCourtId);
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<AvailabilityResponse>(initialAvailability);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInitialMount = useRef(true);

  const fetchData = useCallback(
    async (cid: string, d: string, silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/availability?courtId=${cid}&date=${d}`, {
          cache: 'no-store',
        });
        if (res.status === 404) {
          toast.error('Cancha no encontrada');
          setError(null);
          return;
        }
        if (res.status === 400) {
          toast.error('Datos inválidos');
          setError(null);
          return;
        }
        if (!res.ok) {
          setError('Error de conexión. Reintentando…');
          return;
        }
        const body = (await res.json()) as AvailabilityResponse;
        setData(body);
        setError(null);
      } catch {
        setError('Error de conexión. Reintentando…');
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  // Sync URL when court or date changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.set('courtId', courtId);
    params.set('date', date);
    router.replace(`/?${params.toString()}`, { scroll: false });
    void fetchData(courtId, date);
  }, [courtId, date, router, searchParams, fetchData]);

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchData(courtId, date, true);
      }
    }, REFRESH_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchData(courtId, date, true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [courtId, date, fetchData]);

  // Error retry
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => void fetchData(courtId, date, true), ERROR_RETRY_MS);
    return () => clearTimeout(t);
  }, [error, courtId, date, fetchData]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">canchaslu</h1>
        {refreshing && (
          <span aria-label="refrescando" className="text-xs text-muted-foreground">
            ●
          </span>
        )}
      </header>

      <div className="flex gap-3">
        <CourtSelect courts={initialCourts} value={courtId} onChange={setCourtId} />
        <DateSelect value={date} onChange={setDate} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {data.slots.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          La cancha está cerrada esta fecha.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.slots.map((slot) => (
            <SlotCard
              key={slot.startsAtUtc}
              localStart={slot.localStart}
              localEnd={slot.localEnd}
              priceCents={slot.priceCents}
              available={slot.available}
              currency={data.currency}
              onSelect={() => {
                console.log('TODO: open reservation flow', slot);
                toast.info('Reserva próximamente disponible');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(ui): AgendaView client orchestrator with polling and URL sync"
```

---

## Task 18: Mount Toaster in layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add Toaster**

Open `/Users/dlucca/Projects/software/canchaslu/src/app/layout.tsx`. Modify imports to add `Toaster`:

Find:

```tsx
import './globals.css';
```

Add immediately after:

```tsx
import { Toaster } from '@/components/ui/sonner';
```

Find the body content:

```tsx
<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
```

Replace with:

```tsx
<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
  {children}
  <Toaster position="top-center" />
</body>
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm typecheck
git add -A
git commit -m "feat(ui): mount Sonner toaster in root layout"
```

---

## Task 19: Replace `src/app/page.tsx` with agenda

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace contents**

Overwrite `/Users/dlucca/Projects/software/canchaslu/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

import { fetchActiveCourtById, fetchActiveCourts } from '@/db/queries/courts';
import { fetchAvailabilityInputs } from '@/db/queries/availability';
import { computeAvailableSlots } from '@/lib/availability';

import {
  AgendaView,
  type AvailabilityResponse,
} from '@/components/agenda/AgendaView';

export const dynamic = 'force-dynamic';

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ courtId?: string; date?: string }>;
}) {
  const params = await searchParams;
  const courts = await fetchActiveCourts();
  if (courts.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-muted-foreground">No hay canchas configuradas.</p>
      </main>
    );
  }

  const requestedCourtId = params.courtId ?? courts[0]!.id;
  const requestedDate = params.date ?? todayIso();

  // Validate requested court exists and is active; fall back to first.
  const requestedCourt = await fetchActiveCourtById(requestedCourtId);
  const courtId = requestedCourt ? requestedCourtId : courts[0]!.id;

  // If we fell back, redirect to canonical URL so the address bar reflects state.
  if (!requestedCourt && params.courtId) {
    redirect(`/?courtId=${courtId}&date=${requestedDate}`);
  }

  const inputs = await fetchAvailabilityInputs(courtId, requestedDate);
  if (!inputs) {
    // Should not happen because we already validated the court, but guard anyway.
    redirect(`/?courtId=${courts[0]!.id}&date=${todayIso()}`);
  }

  const slots = computeAvailableSlots({
    court: inputs.court,
    schedule: inputs.schedule,
    exception: inputs.exception,
    reservations: inputs.reservations,
    blockedSlots: inputs.blockedSlots,
    pricingRules: inputs.pricingRules,
    date: requestedDate,
    venueTimezone: inputs.venue.timezone,
    now: new Date(),
  });

  const initialAvailability: AvailabilityResponse = {
    courtId,
    date: requestedDate,
    timezone: inputs.venue.timezone,
    currency: inputs.venue.currency,
    slots: slots.map((s) => ({
      startsAtUtc: s.startsAtUtc.toISOString(),
      endsAtUtc: s.endsAtUtc.toISOString(),
      localStart: s.localStart,
      localEnd: s.localEnd,
      priceCents: s.priceCents,
      available: s.available,
    })),
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col p-4 gap-4">
      <AgendaView
        initialCourts={courts.map((c) => ({ id: c.id, name: c.name }))}
        initialAvailability={initialAvailability}
        initialCourtId={courtId}
        initialDate={requestedDate}
      />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and build**

```bash
pnpm typecheck
pnpm build
```

Expected: both succeed. The build output should show `/` as a Dynamic route (no longer prerendered) because we use `searchParams` and `dynamic = 'force-dynamic'`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(page): replace placeholder with availability agenda"
```

---

## Task 20: Local smoke test

- [ ] **Step 1: Run dev server and verify**

```bash
pnpm dev &
sleep 5
curl -s http://localhost:3000 | grep -oE "(Cancha [12]|No disponible|canchaslu)" | head -10
kill %1
```

Expected: output contains "canchaslu" and at least one of "Cancha 1" or "Cancha 2".

- [ ] **Step 2: Manual browser check (recommended)**

```bash
pnpm dev
```

Open `http://localhost:3000` in a mobile-emulating browser (Chrome DevTools → toggle device toolbar → iPhone SE).

Check:
- Cancha selector shows both canchas.
- Date defaults to today and the input opens a native date picker.
- Slots render with prices. Today is real-date — if today is L–V and there are slots in 19–23, they should show ARS 22.500 or 37.500 (with multiplier 1.5).
- Changing the cancha or date triggers a re-fetch (you'll see the ● indicator briefly).
- URL updates to `?courtId=...&date=...` when you change selectors.
- Refreshing the page preserves the state.
- Tap on an available slot triggers a toast "Reserva próximamente disponible".
- Tap on a "No disponible" slot does nothing.

Stop the dev server when done (`Ctrl+C`).

- [ ] **Step 3: If anything is off, fix it and commit. Otherwise no commit needed.**

---

## Task 21: Push and deploy

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/public-availability
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "Sub-project 2: public availability (endpoint + agenda page)" --body "$(cat <<'EOF'
## Summary

- New endpoints `GET /api/courts` and `GET /api/availability` (Zod-validated input, no-store cache).
- Public agenda page at `/` with court+date selectors, auto-refresh every 30s, refresh on visibilitychange, URL state sync.
- Pure logic in `src/lib/{timezone,pricing,availability}.ts` covered by 20 unit tests.

No reservation creation yet — tap on a slot toasts "próximamente". That ships in sub-project 3.

## Spec & Plan

- [Design spec](../blob/feat/public-availability/docs/superpowers/specs/2026-05-19-public-availability-design.md)
- [Implementation plan](../blob/feat/public-availability/docs/superpowers/plans/2026-05-19-public-availability.md)

## Test plan

- [x] `pnpm test` (20 unit tests pass)
- [x] `pnpm typecheck` ✓
- [x] `pnpm lint` ✓
- [x] `pnpm build` ✓
- [x] `/api/courts` and `/api/availability` smoke-tested locally against Supabase
- [x] Manual mobile-emulated browser check of `/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Vercel preview deploy**

Vercel auto-creates a preview deployment when the PR is pushed. Wait ~1-2 minutes, then check the PR comments for the preview URL (or check Vercel dashboard → Deployments).

Open the preview URL on your phone (or DevTools mobile emulator). Verify the agenda loads, selectors work, polling shows the ● indicator.

- [ ] **Step 4: Merge**

When you're satisfied:

```bash
gh pr merge --merge --delete-branch
git checkout main && git pull
```

The merge triggers a production deploy. Verify `https://canchaslu.vercel.app/` shows the agenda after the deploy finishes.

---

## Done

When all 21 tasks are complete:
- Unit tests: 20 passing (3 timezone + 7 pricing + 10 availability).
- API: `/api/courts` and `/api/availability` live.
- Page `/` shows real-time availability for selected court and date.
- Auto-refresh works (30s + visibilitychange).
- Production deploy on `canchaslu.vercel.app` reflects the change.

Ready for sub-project 3 (guest reservation flow with MercadoPago).
