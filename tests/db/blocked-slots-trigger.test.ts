import { afterEach, describe, expect, it } from 'vitest';

import { blockedSlots, courts, reservations, venues } from '@/db/schema';

import { testDb } from './_setup';

async function insertCourt() {
  const [v] = await testDb
    .insert(venues)
    .values({ name: `test-${crypto.randomUUID()}`, address: '-' })
    .returning();
  if (!v) throw new Error('venue insert failed');
  const [c] = await testDb
    .insert(courts)
    .values({
      venueId: v.id,
      name: 'c',
      type: 'f5',
      surface: 'sintetico',
      basePriceCents: 100_000,
    })
    .returning();
  if (!c) throw new Error('court insert failed');
  return c;
}

describe('blocked_slots / reservations anti-overlap triggers', () => {
  afterEach(async () => {
    await testDb.delete(blockedSlots);
    await testDb.delete(reservations);
    await testDb.delete(courts);
    await testDb.delete(venues);
  });

  it('blocks a blocked_slot that overlaps an active reservation', async () => {
    const c = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      status: 'confirmed',
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(blockedSlots).values({
        courtId: c.id,
        startsAt: new Date('2026-06-01T10:30:00Z'),
        endsAt: new Date('2026-06-01T11:30:00Z'),
        reason: 'mantenimiento',
      }),
    ).rejects.toThrow(/overlap/i);
  });

  it('allows a non-overlapping blocked_slot', async () => {
    const c = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      status: 'confirmed',
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(blockedSlots).values({
        courtId: c.id,
        startsAt: new Date('2026-06-01T12:00:00Z'),
        endsAt: new Date('2026-06-01T13:00:00Z'),
        reason: 'mantenimiento',
      }),
    ).resolves.toBeDefined();
  });

  it('blocks a reservation that overlaps an existing blocked_slot', async () => {
    const c = await insertCourt();

    await testDb.insert(blockedSlots).values({
      courtId: c.id,
      startsAt: new Date('2026-06-01T12:00:00Z'),
      endsAt: new Date('2026-06-01T13:00:00Z'),
      reason: 'mantenimiento',
    });

    await expect(
      testDb.insert(reservations).values({
        courtId: c.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T12:30:00Z'),
        endsAt: new Date('2026-06-01T13:30:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).rejects.toThrow(/overlap/i);
  });
});
