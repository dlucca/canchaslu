import { z } from 'zod';

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  DATABASE_URL_TEST: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
