import { boolean, integer, pgTable, time, uuid } from 'drizzle-orm/pg-core';
import { courts } from './courts';

export const courtSchedules = pgTable('court_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
  active: boolean('active').notNull().default(true),
});

export type CourtSchedule = typeof courtSchedules.$inferSelect;
export type NewCourtSchedule = typeof courtSchedules.$inferInsert;
