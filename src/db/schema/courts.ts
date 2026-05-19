import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { courtSurfaceEnum, courtTypeEnum } from './enums';
import { venues } from './venues';

export const courts = pgTable('courts', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  type: courtTypeEnum('type').notNull(),
  surface: courtSurfaceEnum('surface').notNull(),
  covered: boolean('covered').notNull().default(false),
  slotDurationMin: integer('slot_duration_min').notNull().default(60),
  basePriceCents: integer('base_price_cents').notNull(),
  active: boolean('active').notNull().default(true),
  photos: jsonb('photos').notNull().default([]).$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Court = typeof courts.$inferSelect;
export type NewCourt = typeof courts.$inferInsert;
