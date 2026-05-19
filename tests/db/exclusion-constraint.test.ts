import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { courts, reservations, venues } from '@/db/schema';

import { testDb } from './_setup';

async function insertCourt() {
  const [v] = await testDb
    .insert(venues)
    .values({ name: `test-${crypto.randomUUID()}`, address: '-' })
    .returning();
  if (!v) throw new Error('venue insert failed');
  const [c1] = await testDb
    .insert(courts)
    .values({
      venueId: v.id,
      name: 'c1',
      type: 'f5',
      surface: 'sintetico',
      basePriceCents: 100_000,
    })
    .returning();
  const [c2] = await testDb
    .insert(courts)
    .values({
      venueId: v.id,
      name: 'c2',
      type: 'f5',
      surface: 'sintetico',
      basePriceCents: 100_000,
    })
    .returning();
  if (!c1 || !c2) throw new Error('court insert failed');
  return { c1, c2 };
}

describe('reservations exclusion constraint', () => {
  afterEach(async () => {
    await testDb.delete(reservations);
    await testDb.delete(courts);
    await testDb.delete(venues);
  });

  it('blocks overlapping pending reservations on the same court', async () => {
    const { c1 } = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c1.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(reservations).values({
        courtId: c1.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T10:30:00Z'),
        endsAt: new Date('2026-06-01T11:30:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).rejects.toThrow(/exclusion|overlap|conflicting/i);
  });

  it('allows overlapping reservations on different courts', async () => {
    const { c1, c2 } = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c1.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(reservations).values({
        courtId: c2.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T10:00:00Z'),
        endsAt: new Date('2026-06-01T11:00:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).resolves.toBeDefined();
  });

  it('ignores cancelled reservations when checking overlap', async () => {
    const { c1 } = await insertCourt();

    const [a] = await testDb
      .insert(reservations)
      .values({
        courtId: c1.id,
        userName: 'A',
        userPhone: '+5491100000001',
        startsAt: new Date('2026-06-01T10:00:00Z'),
        endsAt: new Date('2026-06-01T11:00:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      })
      .returning();
    if (!a) throw new Error('A not inserted');

    await testDb
      .update(reservations)
      .set({ status: 'cancelled', cancelledAt: new Date(), cancellationReason: 'user' })
      .where(eq(reservations.id, a.id));

    await expect(
      testDb.insert(reservations).values({
        courtId: c1.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T10:30:00Z'),
        endsAt: new Date('2026-06-01T11:30:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).resolves.toBeDefined();
  });
});
