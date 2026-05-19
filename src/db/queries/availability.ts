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
