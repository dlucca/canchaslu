import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { paymentProviderEnum, paymentRowStatusEnum } from './enums';
import { reservations } from './reservations';

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  reservationId: uuid('reservation_id')
    .notNull()
    .references(() => reservations.id, { onDelete: 'restrict' }),
  provider: paymentProviderEnum('provider').notNull(),
  providerPaymentId: text('provider_payment_id'),
  providerEventId: text('provider_event_id').unique(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('ARS'),
  status: paymentRowStatusEnum('status').notNull(),
  rawPayload: jsonb('raw_payload'),
  webhookReceivedAt: timestamp('webhook_received_at', { withTimezone: true }),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
