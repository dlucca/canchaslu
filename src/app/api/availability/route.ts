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
