import { and, eq, lt } from 'drizzle-orm';

import { db } from '@/db';
import {
  auditLog,
  payments,
  reservations,
  type NewPayment,
  type NewReservation,
} from '@/db/schema';

/**
 * Insert a new reservation in `pending` state. Returns the created row.
 * Throws if the EXCLUDE constraint rejects (slot conflict). The route handler
 * should catch and translate to 409.
 */
export async function createPendingReservation(values: NewReservation) {
  const [row] = await db.insert(reservations).values(values).returning();
  if (!row) throw new Error('reservation insert returned no rows');
  return row;
}

/** Find a reservation by id. Returns null if not found. */
export async function findReservationById(id: string) {
  const rows = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Transition a reservation from `pending` → `confirmed` atomically with the
 * payment and audit_log rows. If the reservation is no longer pending, the
 * transition is skipped (returns 'skipped') but the payment row is still
 * inserted (marked as late) for traceability.
 */
export async function transitionReservationToConfirmed(opts: {
  reservationId: string;
  payment: Omit<NewPayment, 'reservationId'>;
}): Promise<'confirmed' | 'skipped'> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, opts.reservationId))
      .for('update')
      .limit(1);
    if (!current) throw new Error(`reservation ${opts.reservationId} not found`);

    const outcome: 'confirmed' | 'skipped' =
      current.status === 'pending' && opts.payment.status === 'approved' ? 'confirmed' : 'skipped';

    if (outcome === 'confirmed') {
      await tx
        .update(reservations)
        .set({
          status: 'confirmed',
          paymentStatus: 'paid_deposit',
          paymentMethod: 'mercadopago',
        })
        .where(eq(reservations.id, opts.reservationId));
    }

    await tx
      .insert(payments)
      .values({ ...opts.payment, reservationId: opts.reservationId });

    await tx.insert(auditLog).values({
      entityType: 'reservation',
      entityId: opts.reservationId,
      action: outcome === 'confirmed' ? 'webhook_confirmed' : 'webhook_late',
      actorType: 'webhook',
      diff: {
        from: current.status,
        to: outcome === 'confirmed' ? 'confirmed' : current.status,
        paymentStatus: opts.payment.status,
      },
    });

    return outcome;
  });
}

/**
 * Cancel all pending reservations whose `expires_at` is in the past.
 * Returns the IDs of cancelled reservations.
 */
export async function expireOverdueReservations() {
  const expired = await db
    .update(reservations)
    .set({
      status: 'cancelled',
      cancellationReason: 'timeout',
      cancelledAt: new Date(),
    })
    .where(and(eq(reservations.status, 'pending'), lt(reservations.expiresAt, new Date())))
    .returning({ id: reservations.id });
  return expired;
}
