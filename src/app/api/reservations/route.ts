import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { fetchActiveCourtById } from '@/db/queries/courts';
import { fetchAvailabilityInputs } from '@/db/queries/availability';
import { createPendingReservation } from '@/db/queries/reservations';
import { db } from '@/db';
import { reservations as reservationsTable, venues } from '@/db/schema';

import {
  jsonInternalError,
  jsonNotFound,
  jsonValidationError,
  newRequestId,
} from '@/lib/api-error';
import { signCancellationToken } from '@/lib/cancellation-token';
import { computeReservationPrice } from '@/lib/reservation-pricing';
import { createMercadoPagoClient } from '@/lib/mercadopago';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const RESERVATION_TIMEOUT_MIN = 15;

const BodySchema = z.object({
  courtId: z.string().uuid(),
  startsAtUtc: z.string().datetime({ offset: false }),
  endsAtUtc: z.string().datetime({ offset: false }),
  userName: z.string().trim().min(1).max(120),
  userPhone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'whatsapp E.164 (+5491100000000)'),
  userEmail: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return jsonValidationError(parsed.error.issues);

    const { courtId, startsAtUtc, endsAtUtc, userName, userPhone, userEmail } = parsed.data;
    const startsAt = new Date(startsAtUtc);
    const endsAt = new Date(endsAtUtc);

    if (!(startsAt < endsAt)) {
      return jsonValidationError([
        { code: 'custom', path: ['endsAtUtc'], message: 'endsAt must be after startsAt' },
      ]);
    }

    const courtMeta = await fetchActiveCourtById(courtId);
    if (!courtMeta) return jsonNotFound('court_not_found');

    const [venue] = await db
      .select({
        id: venues.id,
        timezone: venues.timezone,
        currency: venues.currency,
        depositPct: venues.depositPct,
      })
      .from(venues)
      .where(eq(venues.id, courtMeta.venueId))
      .limit(1);
    if (!venue) return jsonInternalError(requestId);

    const localDateInTz = new Intl.DateTimeFormat('en-CA', {
      timeZone: venue.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(startsAt);

    const inputs = await fetchAvailabilityInputs(courtId, localDateInTz);
    if (!inputs) return jsonNotFound('court_not_found');

    const { totalCents, depositCents } = computeReservationPrice({
      court: { basePriceCents: inputs.court.basePriceCents },
      pricingRules: inputs.pricingRules,
      startsAtUtc: startsAt,
      endsAtUtc: endsAt,
      venueTimezone: inputs.venue.timezone,
      depositPct: venue.depositPct,
    });

    const expiresAt = new Date(Date.now() + RESERVATION_TIMEOUT_MIN * 60_000);

    // INSERT — EXCLUDE constraint may reject with overlap. Catch and translate to 409.
    let reservation;
    try {
      reservation = await createPendingReservation({
        courtId,
        userName,
        userPhone,
        userEmail: userEmail ?? null,
        startsAt,
        endsAt,
        status: 'pending',
        paymentStatus: 'unpaid',
        totalCents,
        depositCents,
        currency: inputs.venue.currency,
        expiresAt,
        createdBy: 'guest',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/exclusion|overlap|conflicting/i.test(msg)) {
        return NextResponse.json(
          { error: 'slot_unavailable' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      throw err;
    }

    // Sign cancellation token with the real reservation id, then save.
    const cancellationToken = signCancellationToken(
      { reservationId: reservation.id, expiresAtUtc: startsAt.toISOString() },
      env.CANCELLATION_TOKEN_SECRET,
    );
    await db
      .update(reservationsTable)
      .set({ cancellationToken })
      .where(eq(reservationsTable.id, reservation.id));

    // Create MP preference
    const mp = createMercadoPagoClient(env.MP_ACCESS_TOKEN);
    const preference = await mp.createPreference({
      reservationId: reservation.id,
      description: `${courtMeta.name} - ${startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      unitPriceCents: depositCents,
      currency: inputs.venue.currency,
      payerEmail: userEmail ?? undefined,
      expiresAtUtc: expiresAt,
      backUrlBase: env.NEXT_PUBLIC_APP_URL,
      notificationUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
    });

    return NextResponse.json(
      {
        reservationId: reservation.id,
        checkoutUrl: preference.initPoint,
        sandboxCheckoutUrl: preference.sandboxInitPoint,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', requestId, route: 'POST /api/reservations', err: String(err) }),
    );
    return jsonInternalError(requestId);
  }
}
