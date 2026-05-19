import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import {
  cancellationReasonEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  reservationCreatedByEnum,
  reservationStatusEnum,
} from './enums';
import { courts } from './courts';

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'restrict' }),
  userName: text('user_name').notNull(),
  userPhone: text('user_phone').notNull(),
  userEmail: text('user_email'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  // time_range tstzrange is added by 0001_constraints_triggers.sql (generated column)
  status: reservationStatusEnum('status').notNull().default('pending'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
  paymentMethod: paymentMethodEnum('payment_method'),
  totalCents: integer('total_cents').notNull(),
  depositCents: integer('deposit_cents').notNull(),
  currency: text('currency').notNull().default('ARS'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  cancellationToken: text('cancellation_token').unique(),
  createdBy: reservationCreatedByEnum('created_by').notNull(),
  adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  notes: text('notes'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: cancellationReasonEnum('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
