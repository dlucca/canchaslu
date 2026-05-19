import { boolean, date, pgTable, text, time, uuid } from 'drizzle-orm/pg-core';
import { courts } from './courts';

export const scheduleExceptions = pgTable('schedule_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  opensAt: time('opens_at'),
  closesAt: time('closes_at'),
  closed: boolean('closed').notNull().default(false),
  reason: text('reason'),
});

export type ScheduleException = typeof scheduleExceptions.$inferSelect;
export type NewScheduleException = typeof scheduleExceptions.$inferInsert;
