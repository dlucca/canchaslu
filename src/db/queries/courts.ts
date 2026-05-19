import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { courts, venues } from '@/db/schema';

export type ActiveCourt = {
  id: string;
  name: string;
  type: string;
  surface: string;
  covered: boolean;
  venueId: string;
};

export async function fetchActiveCourts(): Promise<ActiveCourt[]> {
  const rows = await db
    .select({
      id: courts.id,
      name: courts.name,
      type: courts.type,
      surface: courts.surface,
      covered: courts.covered,
      venueId: courts.venueId,
    })
    .from(courts)
    .innerJoin(venues, eq(courts.venueId, venues.id))
    .where(eq(courts.active, true))
    .orderBy(asc(courts.name));
  return rows;
}

export async function fetchActiveCourtById(id: string): Promise<ActiveCourt | null> {
  const rows = await db
    .select({
      id: courts.id,
      name: courts.name,
      type: courts.type,
      surface: courts.surface,
      covered: courts.covered,
      venueId: courts.venueId,
    })
    .from(courts)
    .where(and(eq(courts.id, id), eq(courts.active, true)))
    .limit(1);
  return rows[0] ?? null;
}
