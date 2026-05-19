import { resolvePriceCents, type PricingRuleInput } from './pricing';

export type ReservationPriceInputs = {
  court: { basePriceCents: number };
  pricingRules: PricingRuleInput[];
  startsAtUtc: Date;
  endsAtUtc: Date;
  venueTimezone: string;
  depositPct: number;
};

export type ReservationPrice = {
  totalCents: number;
  depositCents: number;
};

/**
 * Re-computes the total + deposit for a reservation server-side. Never trust the client.
 */
export function computeReservationPrice(inputs: ReservationPriceInputs): ReservationPrice {
  const localStart = formatLocalHm(inputs.startsAtUtc, inputs.venueTimezone);
  const dayOfWeek = dayOfWeekInTz(inputs.startsAtUtc, inputs.venueTimezone);

  const totalCents = resolvePriceCents(
    inputs.court.basePriceCents,
    inputs.pricingRules,
    localStart,
    dayOfWeek,
  );
  const depositCents = Math.round((totalCents * inputs.depositPct) / 100);
  return { totalCents, depositCents };
}

function formatLocalHm(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  const h = lookup.hour === '24' ? '00' : (lookup.hour ?? '00');
  const m = lookup.minute ?? '00';
  return `${h}:${m}`;
}

function dayOfWeekInTz(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).formatToParts(
    date,
  );
  const wk = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wk] ?? 0;
}
