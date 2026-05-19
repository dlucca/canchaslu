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
