import { NextResponse, type NextRequest } from 'next/server';

import { expireOverdueReservations } from '@/db/queries/reservations';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return new NextResponse('forbidden', { status: 401 });
  }

  try {
    const expired = await expireOverdueReservations();
    console.log(
      JSON.stringify({
        level: 'info',
        route: 'cron/expire-reservations',
        count: expired.length,
        ids: expired.map((r) => r.id),
      }),
    );
    return NextResponse.json({ expired: expired.length });
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', route: 'cron/expire-reservations', err: String(err) }),
    );
    return new NextResponse('internal error', { status: 500 });
  }
}
