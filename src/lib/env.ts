import { z } from 'zod';

// Treat empty strings (Vercel injects empty for unset vars) and undefined as absent.
const optionalUrl = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : v),
  z.string().url().optional(),
);

const optionalUrlWithDefault = (fallback: string) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? fallback : v),
    z.string().url().catch(fallback),
  );

// Required secrets: must be present and non-empty. We don't validate format
// because MP tokens / random hex strings have no canonical shape.
const requiredSecret = z.string().min(8, 'must be set and at least 8 chars');

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  DATABASE_URL_TEST: optionalUrl,
  NEXT_PUBLIC_APP_URL: optionalUrlWithDefault('http://localhost:3000'),
  MP_ACCESS_TOKEN: requiredSecret,
  MP_WEBHOOK_SECRET: requiredSecret,
  CANCELLATION_TOKEN_SECRET: requiredSecret,
  CRON_SECRET: requiredSecret,
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
