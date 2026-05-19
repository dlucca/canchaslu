import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { payments } from '@/db/schema';

/**
 * Returns true if a payment row with the given provider event id already exists.
 * Used for webhook idempotency.
 */
export async function paymentExistsByProviderEventId(providerEventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.providerEventId, providerEventId))
    .limit(1);
  return rows.length > 0;
}
