import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditActorTypeEnum } from './enums';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(),
  actorType: auditActorTypeEnum('actor_type').notNull(),
  actorId: uuid('actor_id'),
  diff: jsonb('diff'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
