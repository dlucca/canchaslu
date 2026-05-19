# Setup + Schema + Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the canchaslu repo with Next.js 15 + Drizzle against Supabase Postgres, with the full PRD §9 schema (including the GIST exclusion constraint and anti-overlap triggers) seeded with 1 venue + 2 courts and validated by integration tests.

**Architecture:** Single Next.js app, App Router. Drizzle ORM with two migration sources: `drizzle-kit generate` for trivial DDL and one hand-written `.sql` file for what Drizzle can't emit (btree_gist, generated `tstzrange`, EXCLUDE constraint, triggers). A custom migrator runs all `.sql` files in `src/db/migrations/` in lexicographic order and tracks applied filenames in `__migrations`.

**Tech Stack:** Next.js 15, TypeScript strict, pnpm, Node 20, TailwindCSS, shadcn/ui, Drizzle ORM, `postgres` (porsager) driver, Supabase Postgres (hosted), Vitest, Zod (env validation).

**Reference docs:**
- Spec: [docs/superpowers/specs/2026-05-19-setup-schema-design.md](../specs/2026-05-19-setup-schema-design.md)
- PRD: [PRD-Canchas-Futbol-v3.md](../../../PRD-Canchas-Futbol-v3.md) (schema in §9, invariants in §11)
- Locked invariants: [CLAUDE.md](../../../CLAUDE.md)

---

## Pre-requisites for the engineer

Before starting, you need:
1. A Supabase project (free tier is fine). Two URLs from Project Settings → Database → Connection String:
   - **Pooler** (Transaction mode, port 6543): goes in `DATABASE_URL`
   - **Direct** (Session mode, port 5432): goes in `DIRECT_URL` and `DATABASE_URL_TEST`
2. For the test DB, the simplest approach: same Supabase project, but tests `DROP SCHEMA public CASCADE; CREATE SCHEMA public` before each file. **Do not point `DATABASE_URL_TEST` at the same DB as dev** — create a second free Supabase project, or use a local Postgres 16 with `btree_gist` available.
3. Node 20 LTS installed (`nvm install 20 && nvm use 20`).
4. pnpm installed globally (`npm i -g pnpm`).

---

## File Structure

Files this plan creates (target end state):

```
canchaslu/
├── .env.example
├── .gitignore                          # already exists, add Node ignores
├── .nvmrc                              # "20"
├── .prettierrc
├── README.md
├── components.json                     # shadcn config
├── drizzle.config.ts
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── public/                             # default Next assets
├── scripts/
│   ├── migrate.ts                      # custom migrator (drizzle .sql files + tracking)
│   └── db-reset.ts                     # drop schema public + recreate + migrate + seed
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                    # placeholder
│   ├── db/
│   │   ├── index.ts                    # exports `db`
│   │   ├── schema/
│   │   │   ├── index.ts                # re-exports
│   │   │   ├── enums.ts
│   │   │   ├── venues.ts
│   │   │   ├── courts.ts
│   │   │   ├── courtSchedules.ts
│   │   │   ├── scheduleExceptions.ts
│   │   │   ├── pricingRules.ts
│   │   │   ├── reservations.ts
│   │   │   ├── blockedSlots.ts
│   │   │   ├── payments.ts
│   │   │   ├── adminUsers.ts
│   │   │   └── auditLog.ts
│   │   ├── migrations/
│   │   │   ├── 0000_init.sql           # drizzle-kit generated
│   │   │   └── 0001_constraints_triggers.sql   # hand-written
│   │   └── seed.ts
│   └── lib/
│       └── env.ts                      # Zod-validated env
└── tests/
    └── db/
        ├── _setup.ts                   # reset helper
        ├── exclusion-constraint.test.ts
        └── blocked-slots-trigger.test.ts
```

Boundaries: `src/db/schema/*` only declares tables (one file per entity). `src/db/index.ts` is the only place that constructs a connection. `scripts/*` are CLI entrypoints, never imported from app code. `src/lib/env.ts` is the only module that reads `process.env`.

---

## Task 1: Initialize Next.js 15 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/{layout,page,globals.css}.tsx`, `.prettierrc`, `.nvmrc`, `public/`
- Modify: `.gitignore` (add Node entries — most are already there)

- [ ] **Step 1: Run create-next-app non-interactively**

```bash
cd /Users/dlucca/Projects/software/canchaslu
pnpm dlx create-next-app@15 . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --no-turbopack --skip-install --yes
```

If the command refuses because the directory isn't empty, scaffold into a temp dir and copy non-conflicting files in:

```bash
pnpm dlx create-next-app@15 /tmp/canchaslu-scaffold \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --no-turbopack --skip-install --yes
cp -rn /tmp/canchaslu-scaffold/. .
rm -rf /tmp/canchaslu-scaffold
```

Expected: `src/app/`, `package.json`, `tsconfig.json`, etc. created. Existing files (`.gitignore`, `CLAUDE.md`, `PRD-…md`, `docs/`) untouched.

- [ ] **Step 2: Replace `src/app/page.tsx` with a placeholder**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-2xl font-semibold">canchaslu — en construcción</h1>
    </main>
  );
}
```

- [ ] **Step 3: Tighten `tsconfig.json` to strict + noUncheckedIndexedAccess**

Open `tsconfig.json` and ensure `compilerOptions` includes:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "target": "ES2022",
  "moduleResolution": "Bundler"
}
```

Leave the rest of the file as create-next-app generated it.

- [ ] **Step 4: Create `.nvmrc` and `.prettierrc`**

`.nvmrc`:
```
20
```

`.prettierrc`:
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

- [ ] **Step 5: Pin Node engine in `package.json`**

Edit `package.json` to add at top level:

```json
"engines": {
  "node": ">=20.0.0 <21",
  "pnpm": ">=9"
}
```

- [ ] **Step 6: Install dependencies**

```bash
pnpm install
```

Expected: `node_modules/` created, `pnpm-lock.yaml` generated. No errors.

- [ ] **Step 7: Verify build and dev**

```bash
pnpm build
```

Expected: build succeeds, output mentions `/` route as static.

```bash
pnpm dev &
sleep 5
curl -s http://localhost:3000 | grep -q "en construcción" && echo OK
kill %1
```

Expected: `OK` printed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + TypeScript + Tailwind"
```

---

## Task 2: Add Prettier as a dependency and wire format script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Prettier**

```bash
pnpm add -D prettier
```

- [ ] **Step 2: Add scripts to `package.json`**

Add to the `"scripts"` block (keep existing `dev`, `build`, `start`, `lint`):

```json
"format": "prettier --write \"src/**/*.{ts,tsx,css,md}\" \"scripts/**/*.ts\" \"tests/**/*.ts\"",
"format:check": "prettier --check \"src/**/*.{ts,tsx,css,md}\" \"scripts/**/*.ts\" \"tests/**/*.ts\"",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Run format and typecheck**

```bash
pnpm format
pnpm typecheck
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add Prettier and typecheck scripts"
```

---

## Task 3: Initialize shadcn/ui

**Files:**
- Create: `components.json`, `src/lib/utils.ts`
- Modify: `tailwind.config.ts`, `src/app/globals.css`

- [ ] **Step 1: Run shadcn init**

```bash
pnpm dlx shadcn@latest init --yes --base-color slate --css-variables
```

If prompted for style or alias, accept defaults (`new-york`, `@/components`, `@/lib/utils`).

Expected: `components.json` and `src/lib/utils.ts` created; `tailwind.config.ts` and `globals.css` updated with CSS variables.

- [ ] **Step 2: Verify build still passes**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: initialize shadcn/ui (no components consumed)"
```

---

## Task 4: Install Drizzle, postgres driver, Zod

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add drizzle-orm postgres zod
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D drizzle-kit tsx
```

`tsx` is used to run TypeScript scripts (`scripts/migrate.ts`, `seed.ts`, etc.) without a build step.

- [ ] **Step 3: Verify install**

```bash
pnpm ls drizzle-orm drizzle-kit postgres zod tsx
```

Expected: all five listed with versions.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add Drizzle, postgres driver, Zod, tsx"
```

---

## Task 5: Env validation with Zod

**Files:**
- Create: `src/lib/env.ts`, `.env.example`

- [ ] **Step 1: Create `.env.example`**

```
# --- DB (sub-project 1) ---
DATABASE_URL=
DIRECT_URL=
DATABASE_URL_TEST=

# --- Supabase (sub-project 1: client used by features later) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- MercadoPago (unused in sub-project 1) ---
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=

# --- Resend (unused in sub-project 1) ---
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# --- Sentry (unused in sub-project 1) ---
SENTRY_DSN=

# --- Auth (unused in sub-project 1) ---
CANCELLATION_TOKEN_SECRET=
```

- [ ] **Step 2: Create `src/lib/env.ts`**

```ts
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
```

- [ ] **Step 3: Create a local `.env` from the example for local dev**

The engineer fills in `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TEST` with their actual Supabase URLs. `.env` is gitignored.

```bash
cp .env.example .env
```

Then edit `.env` and fill in the three URLs from your Supabase project.

- [ ] **Step 4: Smoke test env loading**

```bash
DATABASE_URL=postgres://x DIRECT_URL=postgres://y pnpm tsx -e "import('./src/lib/env').then(m => console.log(m.env))"
```

Expected: prints `{ DATABASE_URL: 'postgres://x', DIRECT_URL: 'postgres://y', ... }`.

```bash
pnpm tsx -e "import('./src/lib/env').then(m => console.log(m.env))" 2>&1 | head -5
```

(Without env vars set.) Expected: error mentioning `DATABASE_URL`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add Zod-validated env loader and .env.example"
```

---

## Task 6: Drizzle schema — enums

**Files:**
- Create: `src/db/schema/enums.ts`, `src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/enums.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/db/schema/index.ts`**

```ts
export * from './enums';
```

(We will add more re-exports in later tasks.)

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): declare all enums"
```

---

## Task 7: Drizzle schema — venues and courts

**Files:**
- Create: `src/db/schema/venues.ts`, `src/db/schema/courts.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/venues.ts`**

```ts
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
  currency: text('currency').notNull().default('ARS'),
  depositPct: integer('deposit_pct').notNull().default(30),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
```

- [ ] **Step 2: Create `src/db/schema/courts.ts`**

```ts
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
```

- [ ] **Step 3: Update `src/db/schema/index.ts`**

```ts
export * from './enums';
export * from './venues';
export * from './courts';
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): venues and courts tables"
```

---

## Task 8: Drizzle schema — schedules, exceptions, pricing rules

**Files:**
- Create: `src/db/schema/courtSchedules.ts`, `src/db/schema/scheduleExceptions.ts`, `src/db/schema/pricingRules.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/courtSchedules.ts`**

```ts
import { boolean, integer, pgTable, time, uuid } from 'drizzle-orm/pg-core';
import { courts } from './courts';

export const courtSchedules = pgTable('court_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0 = sunday, 6 = saturday
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
  active: boolean('active').notNull().default(true),
});

export type CourtSchedule = typeof courtSchedules.$inferSelect;
export type NewCourtSchedule = typeof courtSchedules.$inferInsert;
```

- [ ] **Step 2: Create `src/db/schema/scheduleExceptions.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/db/schema/pricingRules.ts`**

```ts
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
```

- [ ] **Step 4: Update `src/db/schema/index.ts`**

```ts
export * from './enums';
export * from './venues';
export * from './courts';
export * from './courtSchedules';
export * from './scheduleExceptions';
export * from './pricingRules';
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): court_schedules, schedule_exceptions, pricing_rules"
```

---

## Task 9: Drizzle schema — admin_users (needed by reservations FK)

**Files:**
- Create: `src/db/schema/adminUsers.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/adminUsers.ts`**

```ts
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminRoleEnum } from './enums';

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  role: adminRoleEnum('role').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;
```

- [ ] **Step 2: Update `src/db/schema/index.ts`**

```ts
export * from './enums';
export * from './venues';
export * from './courts';
export * from './courtSchedules';
export * from './scheduleExceptions';
export * from './pricingRules';
export * from './adminUsers';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): admin_users table"
```

---

## Task 10: Drizzle schema — reservations (without time_range / EXCLUDE)

The generated `time_range tstzrange` column and the EXCLUDE constraint are added in the hand-written migration (Task 14). The Drizzle schema declares the rest.

**Files:**
- Create: `src/db/schema/reservations.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/reservations.ts`**

```ts
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import {
  cancellationReasonEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  reservationCreatedByEnum,
  reservationStatusEnum,
} from './enums';
import { courts } from './courts';

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'restrict' }),
  userName: text('user_name').notNull(),
  userPhone: text('user_phone').notNull(),
  userEmail: text('user_email'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  // time_range tstzrange is added by 0001_constraints_triggers.sql (generated column)
  status: reservationStatusEnum('status').notNull().default('pending'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
  paymentMethod: paymentMethodEnum('payment_method'),
  totalCents: integer('total_cents').notNull(),
  depositCents: integer('deposit_cents').notNull(),
  currency: text('currency').notNull().default('ARS'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  cancellationToken: text('cancellation_token').unique(),
  createdBy: reservationCreatedByEnum('created_by').notNull(),
  adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  notes: text('notes'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: cancellationReasonEnum('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
```

- [ ] **Step 2: Update `src/db/schema/index.ts`**

```ts
export * from './enums';
export * from './venues';
export * from './courts';
export * from './courtSchedules';
export * from './scheduleExceptions';
export * from './pricingRules';
export * from './adminUsers';
export * from './reservations';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): reservations table (time_range added separately)"
```

---

## Task 11: Drizzle schema — blocked_slots, payments, audit_log

**Files:**
- Create: `src/db/schema/blockedSlots.ts`, `src/db/schema/payments.ts`, `src/db/schema/auditLog.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/blockedSlots.ts`**

```ts
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { courts } from './courts';

export const blockedSlots = pgTable('blocked_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  courtId: uuid('court_id')
    .notNull()
    .references(() => courts.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  // time_range tstzrange added by 0001_constraints_triggers.sql
  reason: text('reason'),
  publicVisible: boolean('public_visible').notNull().default(false),
  createdBy: uuid('created_by').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BlockedSlot = typeof blockedSlots.$inferSelect;
export type NewBlockedSlot = typeof blockedSlots.$inferInsert;
```

- [ ] **Step 2: Create `src/db/schema/payments.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/db/schema/auditLog.ts`**

```ts
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
```

- [ ] **Step 4: Update `src/db/schema/index.ts`**

```ts
export * from './enums';
export * from './venues';
export * from './courts';
export * from './courtSchedules';
export * from './scheduleExceptions';
export * from './pricingRules';
export * from './adminUsers';
export * from './reservations';
export * from './blockedSlots';
export * from './payments';
export * from './auditLog';
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): blocked_slots, payments, audit_log tables"
```

---

## Task 12: Drizzle client and config

**Files:**
- Create: `src/db/index.ts`, `drizzle.config.ts`

- [ ] **Step 1: Create `src/db/index.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/lib/env';
import * as schema from './schema';

const queryClient = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type Db = typeof db;
```

`prepare: false` is required for Supabase pooler in transaction mode.

- [ ] **Step 2: Create `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DIRECT_URL;
if (!url) {
  throw new Error('DIRECT_URL is required for drizzle-kit');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 3: Install dotenv (used only by drizzle-kit CLI)**

```bash
pnpm add -D dotenv
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): Drizzle client and drizzle-kit config"
```

---

## Task 13: Generate the initial migration (0000)

**Files:**
- Create: `src/db/migrations/0000_*.sql` (drizzle-kit names it)
- Modify: `package.json` (add scripts)

- [ ] **Step 1: Add db scripts to `package.json`**

Add to `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:migrate": "tsx scripts/migrate.ts",
"db:seed": "tsx scripts/seed.ts",
"db:reset": "tsx scripts/db-reset.ts"
```

- [ ] **Step 2: Generate the initial migration**

Make sure `.env` has a valid `DIRECT_URL` first.

```bash
pnpm db:generate
```

Expected: a file `src/db/migrations/0000_<adjective>_<noun>.sql` is created, plus `src/db/migrations/meta/` files. The SQL contains `CREATE TYPE` for all enums and `CREATE TABLE` for all 10 tables.

- [ ] **Step 3: Rename the generated file to a predictable name**

```bash
mv src/db/migrations/0000_*.sql src/db/migrations/0000_init.sql
```

Update `src/db/migrations/meta/0000_snapshot.json` and `meta/_journal.json` accordingly. Look at `_journal.json` — find the `tag` field for the entry that begins with `0000_` and change it to `0000_init`.

```bash
# verify
ls src/db/migrations/
cat src/db/migrations/meta/_journal.json
```

Expected: `0000_init.sql` present; journal `tag` is `0000_init`.

- [ ] **Step 4: Inspect the generated SQL**

```bash
head -50 src/db/migrations/0000_init.sql
```

Expected: starts with `CREATE TYPE "public"."court_type" AS ENUM(...)`, contains `CREATE TABLE "reservations"` etc. **It must NOT contain `time_range` columns** (we did not declare them in Drizzle).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): generate initial Drizzle migration 0000_init"
```

---

## Task 14: Hand-written migration for constraints and triggers

**Files:**
- Create: `src/db/migrations/0001_constraints_triggers.sql`

- [ ] **Step 1: Create `src/db/migrations/0001_constraints_triggers.sql`**

```sql
-- 0001_constraints_triggers.sql
-- Hand-written: things Drizzle cannot emit (btree_gist, generated tstzrange, EXCLUDE, triggers).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generated tstzrange columns
ALTER TABLE reservations
  ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

ALTER TABLE blocked_slots
  ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

-- Anti-double-booking exclusion constraint on active reservations
ALTER TABLE reservations
  ADD CONSTRAINT no_overlap_active_reservations
  EXCLUDE USING gist (
    court_id WITH =,
    time_range WITH &&
  ) WHERE (status IN ('pending', 'confirmed'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['venues','courts','reservations','payments','admin_users'])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- Anti-overlap between blocked_slots and active reservations (and vice versa)
CREATE OR REPLACE FUNCTION check_blocked_slot_no_overlap_with_reservations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.court_id = NEW.court_id
      AND r.status IN ('pending', 'confirmed')
      AND r.time_range && NEW.time_range
  ) THEN
    RAISE EXCEPTION 'blocked_slot overlaps with active reservation on court %', NEW.court_id
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER blocked_slots_no_overlap
  BEFORE INSERT OR UPDATE ON blocked_slots
  FOR EACH ROW EXECUTE FUNCTION check_blocked_slot_no_overlap_with_reservations();

CREATE OR REPLACE FUNCTION check_reservation_no_overlap_with_blocked_slots()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('pending', 'confirmed') AND EXISTS (
    SELECT 1 FROM blocked_slots b
    WHERE b.court_id = NEW.court_id
      AND b.time_range && NEW.time_range
  ) THEN
    RAISE EXCEPTION 'reservation overlaps with blocked slot on court %', NEW.court_id
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reservations_no_overlap_blocks
  BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION check_reservation_no_overlap_with_blocked_slots();
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(db): hand-written migration for btree_gist, EXCLUDE, triggers"
```

---

## Task 15: Custom migrator script

The drizzle-orm migrator only knows about files it generated. We need a tiny migrator that runs *all* `.sql` files in `src/db/migrations/` in lex order against `DIRECT_URL`, tracking applied filenames in a `__migrations` table.

**Files:**
- Create: `scripts/migrate.ts`

- [ ] **Step 1: Create `scripts/migrate.ts`**

```ts
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

async function main() {
  const sql = postgres(directUrl!, { max: 1, prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const migrationsDir = join(process.cwd(), 'src/db/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    (await sql<{ filename: string }[]>`SELECT filename FROM __migrations`).map((r) => r.filename),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    const sqlText = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`→ applying ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`INSERT INTO __migrations (filename) VALUES (${file})`;
    });
    console.log(`✓ ${file}`);
  }

  await sql.end();
  console.log('migrations done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: Drizzle's generated `.sql` files use `--> statement-breakpoint` markers. `sql.unsafe` runs the whole text as a single multi-statement query, which works because `postgres` accepts multi-statement strings when not using parameters. The `--> statement-breakpoint` comments are valid SQL comments and ignored.

- [ ] **Step 2: Run the migrator against your dev Supabase**

```bash
pnpm db:migrate
```

Expected: prints `→ applying 0000_init.sql` then `→ applying 0001_constraints_triggers.sql`, then `migrations done`.

- [ ] **Step 3: Verify in Supabase SQL editor (or via psql/`postgres`)**

```bash
pnpm tsx -e "
import postgres from 'postgres';
const sql = postgres(process.env.DIRECT_URL, { max: 1, prepare: false });
const tables = await sql\`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename\`;
console.log(tables.map(t => t.tablename));
const cons = await sql\`SELECT conname FROM pg_constraint WHERE conname='no_overlap_active_reservations'\`;
console.log('exclusion constraint:', cons.length === 1 ? 'OK' : 'MISSING');
const ext = await sql\`SELECT extname FROM pg_extension WHERE extname='btree_gist'\`;
console.log('btree_gist:', ext.length === 1 ? 'OK' : 'MISSING');
await sql.end();
"
```

Expected: prints 11 table names (10 schema tables + `__migrations`), `exclusion constraint: OK`, `btree_gist: OK`.

- [ ] **Step 4: Re-run migrator (idempotency)**

```bash
pnpm db:migrate
```

Expected: prints `✓ 0000_init.sql (already applied)` and `✓ 0001_constraints_triggers.sql (already applied)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): custom migrator script with applied-tracking"
```

---

## Task 16: Seed script

**Files:**
- Create: `src/db/seed.ts`, `scripts/seed.ts`

- [ ] **Step 1: Create `src/db/seed.ts`**

```ts
import { eq } from 'drizzle-orm';

import { db } from './index';
import { courtSchedules, courts, pricingRules, venues } from './schema';

export async function seed() {
  const existing = await db.select().from(venues).where(eq(venues.name, 'Complejo Demo')).limit(1);
  if (existing.length > 0) {
    console.log('seed: venue "Complejo Demo" already exists, aborting');
    return;
  }

  const [venue] = await db
    .insert(venues)
    .values({
      name: 'Complejo Demo',
      address: 'A definir',
      timezone: 'America/Argentina/Buenos_Aires',
      currency: 'ARS',
      depositPct: 30,
    })
    .returning();

  if (!venue) throw new Error('failed to insert venue');

  const insertedCourts = await db
    .insert(courts)
    .values([
      {
        venueId: venue.id,
        name: 'Cancha 1',
        type: 'f5',
        surface: 'sintetico',
        covered: true,
        slotDurationMin: 60,
        basePriceCents: 1_500_000,
      },
      {
        venueId: venue.id,
        name: 'Cancha 2',
        type: 'f7',
        surface: 'sintetico',
        covered: false,
        slotDurationMin: 60,
        basePriceCents: 2_500_000,
      },
    ])
    .returning();

  for (const court of insertedCourts) {
    const scheduleRows = Array.from({ length: 7 }, (_, dow) => ({
      courtId: court.id,
      dayOfWeek: dow,
      opensAt: '09:00',
      closesAt: '23:00',
    }));
    await db.insert(courtSchedules).values(scheduleRows);

    const peakRows = Array.from({ length: 5 }, (_, i) => ({
      courtId: court.id,
      dayOfWeek: i + 1, // Mon..Fri
      startTime: '19:00',
      endTime: '23:00',
      multiplier: '1.50',
      priority: 10,
    }));
    await db.insert(pricingRules).values(peakRows);
  }

  console.log(`seed: inserted venue ${venue.id} and ${insertedCourts.length} courts`);
}
```

- [ ] **Step 2: Create `scripts/seed.ts`**

```ts
import 'dotenv/config';
import { seed } from '../src/db/seed';

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 3: Run the seed**

```bash
pnpm db:seed
```

Expected: prints `seed: inserted venue <uuid> and 2 courts`.

- [ ] **Step 4: Run seed again (idempotency)**

```bash
pnpm db:seed
```

Expected: prints `seed: venue "Complejo Demo" already exists, aborting`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): seed script with 1 venue, 2 courts, schedules, peak pricing"
```

---

## Task 17: db:reset script

**Files:**
- Create: `scripts/db-reset.ts`

- [ ] **Step 1: Create `scripts/db-reset.ts`**

```ts
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

async function dropSchema() {
  const sql = postgres(directUrl!, { max: 1, prepare: false });
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await sql.end();
}

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

(async () => {
  console.log('db:reset → DROP SCHEMA public CASCADE');
  await dropSchema();
  console.log('db:reset → migrate');
  run('pnpm', ['db:migrate']);
  console.log('db:reset → seed');
  run('pnpm', ['db:seed']);
  console.log('db:reset done');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

```bash
pnpm db:reset
```

Expected: drops the schema, re-runs both migrations, seeds. Final line: `db:reset done`.

- [ ] **Step 3: Verify**

```bash
pnpm tsx -e "
import postgres from 'postgres';
const sql = postgres(process.env.DIRECT_URL, { max: 1, prepare: false });
const venues = await sql\`SELECT name FROM venues\`;
console.log('venues:', venues);
await sql.end();
"
```

Expected: prints `venues: [{ name: 'Complejo Demo' }]`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): db:reset script"
```

---

## Task 18: Vitest configuration

**Files:**
- Create: `vitest.config.ts`, `tests/db/_setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest @types/node
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
```

`singleFork: true` ensures tests share one process (and DB connection) so they don't trample each other.

- [ ] **Step 3: Add test script to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `tests/db/_setup.ts`**

```ts
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '@/db/schema';

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error('DATABASE_URL_TEST is required for tests');
}

const client = postgres(testUrl, { max: 1, prepare: false });
export const testDb = drizzle(client, { schema });

export async function resetTestDb() {
  await client.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const result = spawnSync('pnpm', ['db:migrate'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DIRECT_URL: testUrl },
  });
  if (result.status !== 0) {
    throw new Error('migrate failed in test setup');
  }
}

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  await client.end();
});
```

- [ ] **Step 5: Verify Vitest runs with no tests**

```bash
pnpm test
```

Expected: "No test files found" — that's fine, Vitest exits 0 (or 1 depending on version; if it exits non-zero, that's expected until we add tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure Vitest with shared DB setup helper"
```

---

## Task 19: Test — exclusion constraint

**Files:**
- Create: `tests/db/exclusion-constraint.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { courts, reservations, venues } from '@/db/schema';

import { testDb } from './_setup';

async function insertCourt() {
  const [v] = await testDb
    .insert(venues)
    .values({ name: `test-${crypto.randomUUID()}`, address: '-' })
    .returning();
  if (!v) throw new Error('venue insert failed');
  const [c1] = await testDb
    .insert(courts)
    .values({
      venueId: v.id,
      name: 'c1',
      type: 'f5',
      surface: 'sintetico',
      basePriceCents: 100_000,
    })
    .returning();
  const [c2] = await testDb
    .insert(courts)
    .values({
      venueId: v.id,
      name: 'c2',
      type: 'f5',
      surface: 'sintetico',
      basePriceCents: 100_000,
    })
    .returning();
  if (!c1 || !c2) throw new Error('court insert failed');
  return { c1, c2 };
}

describe('reservations exclusion constraint', () => {
  afterEach(async () => {
    await testDb.delete(reservations);
    await testDb.delete(courts);
    await testDb.delete(venues);
  });

  it('blocks overlapping pending reservations on the same court', async () => {
    const { c1 } = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c1.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(reservations).values({
        courtId: c1.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T10:30:00Z'),
        endsAt: new Date('2026-06-01T11:30:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).rejects.toThrow(/exclusion|overlap|conflicting/i);
  });

  it('allows overlapping reservations on different courts', async () => {
    const { c1, c2 } = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c1.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(reservations).values({
        courtId: c2.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T10:00:00Z'),
        endsAt: new Date('2026-06-01T11:00:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).resolves.toBeDefined();
  });

  it('ignores cancelled reservations when checking overlap', async () => {
    const { c1 } = await insertCourt();

    const [a] = await testDb
      .insert(reservations)
      .values({
        courtId: c1.id,
        userName: 'A',
        userPhone: '+5491100000001',
        startsAt: new Date('2026-06-01T10:00:00Z'),
        endsAt: new Date('2026-06-01T11:00:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      })
      .returning();
    if (!a) throw new Error('A not inserted');

    await testDb
      .update(reservations)
      .set({ status: 'cancelled', cancelledAt: new Date(), cancellationReason: 'user' })
      .where(eq(reservations.id, a.id));

    await expect(
      testDb.insert(reservations).values({
        courtId: c1.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T10:30:00Z'),
        endsAt: new Date('2026-06-01T11:30:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test tests/db/exclusion-constraint.test.ts
```

Expected: all 3 tests pass.

If any test fails, do NOT skip it. Debug:
- "exclusion constraint: MISSING" → check 0001 migration applied.
- Type errors → re-run `pnpm typecheck` and fix.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(db): integration test for reservations exclusion constraint"
```

---

## Task 20: Test — blocked_slots anti-overlap triggers

**Files:**
- Create: `tests/db/blocked-slots-trigger.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { blockedSlots, courts, reservations, venues } from '@/db/schema';

import { testDb } from './_setup';

async function insertCourt() {
  const [v] = await testDb
    .insert(venues)
    .values({ name: `test-${crypto.randomUUID()}`, address: '-' })
    .returning();
  if (!v) throw new Error('venue insert failed');
  const [c] = await testDb
    .insert(courts)
    .values({
      venueId: v.id,
      name: 'c',
      type: 'f5',
      surface: 'sintetico',
      basePriceCents: 100_000,
    })
    .returning();
  if (!c) throw new Error('court insert failed');
  return c;
}

describe('blocked_slots / reservations anti-overlap triggers', () => {
  afterEach(async () => {
    await testDb.delete(blockedSlots);
    await testDb.delete(reservations);
    await testDb.delete(courts);
    await testDb.delete(venues);
  });

  it('blocks a blocked_slot that overlaps an active reservation', async () => {
    const c = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      status: 'confirmed',
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(blockedSlots).values({
        courtId: c.id,
        startsAt: new Date('2026-06-01T10:30:00Z'),
        endsAt: new Date('2026-06-01T11:30:00Z'),
        reason: 'mantenimiento',
      }),
    ).rejects.toThrow(/overlap/i);
  });

  it('allows a non-overlapping blocked_slot', async () => {
    const c = await insertCourt();

    await testDb.insert(reservations).values({
      courtId: c.id,
      userName: 'A',
      userPhone: '+5491100000001',
      startsAt: new Date('2026-06-01T10:00:00Z'),
      endsAt: new Date('2026-06-01T11:00:00Z'),
      status: 'confirmed',
      totalCents: 100_000,
      depositCents: 30_000,
      createdBy: 'guest',
    });

    await expect(
      testDb.insert(blockedSlots).values({
        courtId: c.id,
        startsAt: new Date('2026-06-01T12:00:00Z'),
        endsAt: new Date('2026-06-01T13:00:00Z'),
        reason: 'mantenimiento',
      }),
    ).resolves.toBeDefined();
  });

  it('blocks a reservation that overlaps an existing blocked_slot', async () => {
    const c = await insertCourt();

    await testDb.insert(blockedSlots).values({
      courtId: c.id,
      startsAt: new Date('2026-06-01T12:00:00Z'),
      endsAt: new Date('2026-06-01T13:00:00Z'),
      reason: 'mantenimiento',
    });

    await expect(
      testDb.insert(reservations).values({
        courtId: c.id,
        userName: 'B',
        userPhone: '+5491100000002',
        startsAt: new Date('2026-06-01T12:30:00Z'),
        endsAt: new Date('2026-06-01T13:30:00Z'),
        totalCents: 100_000,
        depositCents: 30_000,
        createdBy: 'guest',
      }),
    ).rejects.toThrow(/overlap/i);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test tests/db/blocked-slots-trigger.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test
```

Expected: 6 tests pass, no failures.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(db): integration tests for blocked_slots anti-overlap triggers"
```

---

## Task 21: README

**Files:**
- Create/overwrite: `README.md`

- [ ] **Step 1: Write README**

```markdown
# canchaslu

Mobile-first webapp for booking football court time. See [PRD-Canchas-Futbol-v3.md](./PRD-Canchas-Futbol-v3.md) for the full product spec.

## Stack

Next.js 15 (App Router) · TypeScript strict · TailwindCSS + shadcn/ui · Drizzle ORM · Supabase Postgres · Vercel (planned) · MercadoPago Checkout Pro (planned)

## Requirements

- Node 20 LTS (`nvm use`)
- pnpm 9+
- A Supabase project (free tier ok)

## Setup

1. `cp .env.example .env` and fill in:
   - `DATABASE_URL` — pooler connection string (port 6543, Transaction mode)
   - `DIRECT_URL` — direct connection (port 5432, Session mode), used by migrations
   - `DATABASE_URL_TEST` — direct connection to a **separate** Supabase project used by tests (tests drop the schema)
2. `pnpm install`
3. `pnpm db:reset` — drops the public schema, applies migrations, and seeds

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Next dev server on :3000 |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm test` | Vitest integration tests (requires `DATABASE_URL_TEST`) |
| `pnpm db:generate` | Generate a new Drizzle migration from schema diffs |
| `pnpm db:migrate` | Apply pending migrations (uses `DIRECT_URL`) |
| `pnpm db:seed` | Seed venue + 2 courts + schedules + peak pricing rule |
| `pnpm db:reset` | DROP SCHEMA public CASCADE + migrate + seed |

## Migration model

There are two sources of migrations in `src/db/migrations/`:

1. **`0000_init.sql`** — generated by `drizzle-kit generate` from `src/db/schema/`.
2. **`0001_constraints_triggers.sql`** — hand-written. Adds `btree_gist`, the generated `tstzrange` columns on `reservations` and `blocked_slots`, the EXCLUDE constraint on active reservations, and the anti-overlap triggers between `reservations` and `blocked_slots`.

A custom migrator in `scripts/migrate.ts` runs all `.sql` files in lex order and tracks applied filenames in a `__migrations` table.

**Gotcha:** when running `pnpm db:generate` after schema changes, **inspect the diff before committing**. Drizzle-kit doesn't know about the hand-written `time_range` columns. If it tries to drop or alter them, hand-edit the generated SQL or move those changes to a new hand-written migration.

## Layout

- `src/app/` — Next.js App Router (placeholder for now).
- `src/db/schema/` — Drizzle table declarations (one file per entity).
- `src/db/migrations/` — SQL migrations (Drizzle-generated + hand-written).
- `src/db/seed.ts` — idempotent seed.
- `src/lib/env.ts` — Zod-validated `process.env`.
- `scripts/` — CLI entrypoints (`migrate.ts`, `seed.ts`, `db-reset.ts`).
- `tests/db/` — integration tests against `DATABASE_URL_TEST`.

See [CLAUDE.md](./CLAUDE.md) for architectural invariants that must not be broken.
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: README with setup, scripts, and migration model"
```

---

## Task 22: Final smoke test (cold-start verification)

This task verifies the "done" criteria from the spec. Nothing new is written here; we just run the full chain.

- [ ] **Step 1: Clean reset and full test**

```bash
pnpm install
pnpm db:reset
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected:
- `db:reset` ends with `db:reset done` and prints `seed: inserted venue ...`.
- `typecheck` exits 0.
- `lint` exits 0 (warnings ok if any, no errors).
- `test` reports 6 passed, 0 failed.
- `build` succeeds.

- [ ] **Step 2: Manually verify the dev server**

```bash
pnpm dev &
sleep 5
curl -s http://localhost:3000 | grep -q "en construcción" && echo OK
kill %1
```

Expected: `OK`.

- [ ] **Step 3: Final commit (only if anything changed)**

```bash
git status
# if anything is dirty:
git add -A
git commit -m "chore: smoke-test fixups"
```

If nothing is dirty, skip the commit.

---

## Done

When all 22 tasks are complete:
- The repo boots from `pnpm install && pnpm db:reset && pnpm dev`.
- The schema is fully migrated, including the EXCLUDE constraint and anti-overlap triggers.
- Seed data exists: 1 venue + 2 courts + schedules + 1 peak pricing rule.
- 6 integration tests pass, validating the two non-trivial DB invariants.
- The repo is ready for sub-project 2 (public availability page).
