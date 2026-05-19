import { describe, expect, it } from 'vitest';

import { computeReservationPrice } from '@/lib/reservation-pricing';
import type { PricingRuleInput } from '@/lib/pricing';

const court = { basePriceCents: 1_500_000 };
const venueTz = 'America/Argentina/Buenos_Aires';

describe('computeReservationPrice', () => {
  it('uses base price when no rule matches', () => {
    const result = computeReservationPrice({
      court,
      pricingRules: [],
      startsAtUtc: new Date('2026-06-15T13:00:00.000Z'), // Mon 10:00 AR
      endsAtUtc: new Date('2026-06-15T14:00:00.000Z'),
      venueTimezone: venueTz,
      depositPct: 30,
    });
    expect(result.totalCents).toBe(1_500_000);
    expect(result.depositCents).toBe(450_000); // 30% of 1_500_000
  });

  it('applies peak-hour multiplier when slot falls in a matching window', () => {
    const rules: PricingRuleInput[] = [
      {
        dayOfWeek: 1,
        startTime: '19:00',
        endTime: '23:00',
        multiplier: 1.5,
        priority: 10,
        active: true,
      },
    ];
    const result = computeReservationPrice({
      court,
      pricingRules: rules,
      startsAtUtc: new Date('2026-06-15T22:00:00.000Z'), // Mon 19:00 AR
      endsAtUtc: new Date('2026-06-15T23:00:00.000Z'),
      venueTimezone: venueTz,
      depositPct: 30,
    });
    expect(result.totalCents).toBe(2_250_000); // 1_500_000 × 1.5
    expect(result.depositCents).toBe(675_000); // 30% of 2_250_000
  });

  it('rounds the deposit to the nearest cent', () => {
    const result = computeReservationPrice({
      court: { basePriceCents: 1_000_001 }, // odd value
      pricingRules: [],
      startsAtUtc: new Date('2026-06-15T13:00:00.000Z'),
      endsAtUtc: new Date('2026-06-15T14:00:00.000Z'),
      venueTimezone: venueTz,
      depositPct: 33,
    });
    expect(result.depositCents).toBe(Math.round((1_000_001 * 33) / 100));
  });

  it('honours a custom deposit_pct per venue', () => {
    const result = computeReservationPrice({
      court,
      pricingRules: [],
      startsAtUtc: new Date('2026-06-15T13:00:00.000Z'),
      endsAtUtc: new Date('2026-06-15T14:00:00.000Z'),
      venueTimezone: venueTz,
      depositPct: 50,
    });
    expect(result.depositCents).toBe(750_000);
  });
});
