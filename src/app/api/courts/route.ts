import { NextResponse } from 'next/server';

import { fetchActiveCourts } from '@/db/queries/courts';
import { jsonInternalError, newRequestId } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET() {
  const requestId = newRequestId();
  try {
    const courts = await fetchActiveCourts();
    return NextResponse.json(
      {
        courts: courts.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          surface: c.surface,
          covered: c.covered,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', requestId, route: '/api/courts', err: String(err) }));
    return jsonInternalError(requestId);
  }
}
