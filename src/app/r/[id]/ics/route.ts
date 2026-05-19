import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { courts, venues } from '@/db/schema';
import { findReservationById } from '@/db/queries/reservations';
import { buildIcsEvent } from '@/lib/ics';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reservation = await findReservationById(id);
  if (!reservation || reservation.status !== 'confirmed') {
    return new Response('not_found', { status: 404 });
  }

  const [courtRow] = await db
    .select({ id: courts.id, name: courts.name, venueId: courts.venueId })
    .from(courts)
    .where(eq(courts.id, reservation.courtId))
    .limit(1);
  if (!courtRow) return new Response('not_found', { status: 404 });

  const [venueRow] = await db
    .select({ name: venues.name, address: venues.address })
    .from(venues)
    .where(eq(venues.id, courtRow.venueId))
    .limit(1);
  if (!venueRow) return new Response('not_found', { status: 404 });

  const ics = buildIcsEvent({
    reservationId: reservation.id,
    courtName: courtRow.name,
    venueName: venueRow.name,
    venueAddress: venueRow.address,
    startsAtUtc: reservation.startsAt,
    endsAtUtc: reservation.endsAt,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="canchaslu-${reservation.id}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
