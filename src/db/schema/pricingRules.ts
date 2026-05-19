import { boolean, integer, numeric, pgTable, time, uuid } from 'drizzle-orm/pg-core';
import { courts } from './courts';

export const pricingRules = pgTable('pricing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week'),
  startTime: time('start_time'),
  endTime: time('end_time'),
  multiplier: numeric('multiplier', { precision: 4, scale: 2 }).notNull(),
  priority: integer('priority').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export type PricingRule = typeof pricingRules.$inferSelect;
export type NewPricingRule = typeof pricingRules.$inferInsert;
