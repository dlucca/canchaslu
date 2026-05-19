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
