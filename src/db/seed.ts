import { eq } from 'drizzle-orm';

import { db } from './index';
import { courtSchedules, courts, pricingRules, venues } from './schema';

export async function seed() {
  const existing = await db.select().from(venues).where(eq(venues.name, 'Complejo Demo')).limit(1);
  if (existing.length > 0) {
    console.log('seed: venue "Complejo Demo" already exists, aborting');
    return;
  }

  const [venue] = await db
    .insert(venues)
    .values({
      name: 'Complejo Demo',
      address: 'A definir',
      timezone: 'America/Argentina/Buenos_Aires',
      currency: 'ARS',
      depositPct: 30,
    })
    .returning();

  if (!venue) throw new Error('failed to insert venue');

  const insertedCourts = await db
    .insert(courts)
    .values([
      {
        venueId: venue.id,
        name: 'Cancha 1',
        type: 'f5',
        surface: 'sintetico',
        covered: true,
        slotDurationMin: 60,
        basePriceCents: 1_500_000,
      },
      {
        venueId: venue.id,
        name: 'Cancha 2',
        type: 'f7',
        surface: 'sintetico',
        covered: false,
        slotDurationMin: 60,
        basePriceCents: 2_500_000,
      },
    ])
    .returning();

  for (const court of insertedCourts) {
    const scheduleRows = Array.from({ length: 7 }, (_, dow) => ({
      courtId: court.id,
      dayOfWeek: dow,
      opensAt: '09:00',
      closesAt: '23:00',
    }));
    await db.insert(courtSchedules).values(scheduleRows);

    const peakRows = Array.from({ length: 5 }, (_, i) => ({
      courtId: court.id,
      dayOfWeek: i + 1,
      startTime: '19:00',
      endTime: '23:00',
      multiplier: '1.50',
      priority: 10,
    }));
    await db.insert(pricingRules).values(peakRows);
  }

  console.log(`seed: inserted venue ${venue.id} and ${insertedCourts.length} courts`);
}
