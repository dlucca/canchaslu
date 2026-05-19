import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { courts, venues } from '@/db/schema';
import { findReservationById } from '@/db/queries/reservations';
import { env } from '@/lib/env';

import { SuccessClient } from './SuccessClient';

export const dynamic = 'force-dynamic';

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reservation = await findReservationById(id);
  if (!reservation) notFound();

  const [courtRow] = await db
    .select({ id: courts.id, name: courts.name, venueId: courts.venueId })
    .from(courts)
    .where(eq(courts.id, reservation.courtId))
    .limit(1);

  const [venueRow] = courtRow
    ? await db
        .select({ name: venues.name, address: venues.address, timezone: venues.timezone })
        .from(venues)
        .where(eq(venues.id, courtRow.venueId))
        .limit(1)
    : [];

  const cancelUrl = reservation.cancellationToken
    ? `${env.NEXT_PUBLIC_APP_URL}/cancel?token=${encodeURIComponent(reservation.cancellationToken)}`
    : null;

  const venueTz = venueRow?.timezone ?? 'America/Argentina/Buenos_Aires';

  const localStart = new Intl.DateTimeFormat('es-AR', {
    timeZone: venueTz,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(reservation.startsAt);

  const localEnd = new Intl.DateTimeFormat('es-AR', {
    timeZone: venueTz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(reservation.endsAt);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <SuccessClient
        reservation={{
          id: reservation.id,
          status: reservation.status,
          totalCents: reservation.totalCents,
          depositCents: reservation.depositCents,
          currency: reservation.currency,
          startsAtUtc: reservation.startsAt.toISOString(),
          endsAtUtc: reservation.endsAt.toISOString(),
        }}
        court={courtRow ? { name: courtRow.name } : null}
        venue={venueRow ? { name: venueRow.name, address: venueRow.address } : null}
        localStart={localStart}
        localEnd={localEnd}
        cancelUrl={cancelUrl}
        icsUrl={`/r/${reservation.id}/ics`}
      />
    </main>
  );
}
