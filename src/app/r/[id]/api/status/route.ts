import { NextResponse } from 'next/server';

import { findReservationById } from '@/db/queries/reservations';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }
  const reservation = await findReservationById(id);
  if (!reservation) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(
    {
      id: reservation.id,
      status: reservation.status,
      paymentStatus: reservation.paymentStatus,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
