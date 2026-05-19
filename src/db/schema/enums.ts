import { pgEnum } from 'drizzle-orm/pg-core';

export const courtTypeEnum = pgEnum('court_type', ['f5', 'f7', 'f11', 'futsal']);
export const courtSurfaceEnum = pgEnum('court_surface', ['sintetico', 'cemento', 'cesped']);

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
]);

export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'paid_deposit', 'refunded']);
export const paymentMethodEnum = pgEnum('payment_method', ['mercadopago', 'cash']);

export const reservationCreatedByEnum = pgEnum('reservation_created_by', [
  'guest',
  'admin',
  'operator',
]);

export const cancellationReasonEnum = pgEnum('cancellation_reason', [
  'user',
  'admin',
  'admin_force_majeure',
  'timeout',
]);

export const paymentProviderEnum = pgEnum('payment_provider', ['mercadopago', 'cash']);

export const paymentRowStatusEnum = pgEnum('payment_row_status', [
  'pending',
  'approved',
  'rejected',
  'refunded',
  'cancelled',
]);

export const adminRoleEnum = pgEnum('admin_role', ['admin', 'operator']);

export const auditActorTypeEnum = pgEnum('audit_actor_type', [
  'system',
  'admin',
  'operator',
  'guest',
  'webhook',
]);
