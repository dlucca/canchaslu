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
