# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Pre-build. The only artifact is [PRD-Canchas-Futbol-v3.md](PRD-Canchas-Futbol-v3.md) — the closed spec for a mobile-first football court reservation webapp. There is no code, package.json, or git history yet. Read the PRD before proposing implementation work; section 20 lists decisions already locked in (don't relitigate them).

## Product in one paragraph

Mobile-first webapp to reserve hourly slots at a 2-court football venue. Guest checkout (no login), real-time availability, mandatory 30% deposit via MercadoPago Checkout Pro, automatic confirmation. Target: end-to-end booking in <60s on mobile. Admin panel (Supabase Auth) handles manual reservations, blocks, pricing rules, and force-majeure refunds.

## Stack (locked in PRD §5)

- **Frontend**: Next.js 15 App Router + TypeScript, TailwindCSS + shadcn/ui. RSC by default; client components only for interaction.
- **Backend**: Next.js Route Handlers (`/api/*`) and Server Actions. No separate backend service.
- **DB**: Supabase Postgres accessed via **Drizzle ORM**. Supabase Auth (admin panel) and Storage (court photos) are used; **Supabase auto REST/GraphQL and RLS are intentionally NOT used** — all data access goes through the Next.js backend, never the client with an anon key.
- **Infra**: Vercel (app + Cron) + Supabase. Vercel Cron drives reservation timeouts and MP reconciliation.
- **External**: MercadoPago Checkout Pro, Resend (email), Sentry.

## Architectural invariants (don't break these)

These are load-bearing decisions. Changing them requires explicit PRD revision.

1. **Anti-double-booking is enforced in Postgres, not application code.** `reservations` has an `EXCLUDE USING gist` constraint on `(court_id, time_range)` where `status IN ('pending','confirmed')`, with a generated `tstzrange` column. Requires `btree_gist`. A pending reservation holds the slot for 15 minutes whether paid or not.
2. **Money is `integer` cents.** Never floats/decimals for monetary values. Currency is per-venue (default ARS).
3. **All timestamps are `timestamptz` in UTC.** UI renders in the venue's `timezone` (default `America/Argentina/Buenos_Aires`). Timezone is per-venue to support future multi-venue.
4. **Reservation state machine is explicit** (PRD §10). Only the (reservation_status × payment_status) combinations in the matrix are valid; transitions outside it are rejected at the app layer and logged. Every state change goes through one code path.
5. **Webhook + reconciliation is dual by design.** MP webhook handler must: verify HMAC, be idempotent on `provider_event_id`, re-fetch payment status from MP API (don't trust payload), apply changes in a single transaction (reservation + payment + audit_log). A 5-minute cron reconciles `pending` reservations via the same idempotent code path.
6. **Balance owed at the venue is NOT tracked in the system.** Only the online deposit is recorded. The remaining balance is informational in the UI and handled offline by the venue.
7. **Authorization lives in Route Handlers / Server Actions**, not in the DB. There is no RLS safety net — every query path must check auth explicitly.
8. **Guest-only booking in MVP.** No user accounts. Cancellation uses a JWT token emailed to the user, expiring at reservation start time.

## Domain model shape

Core entities (full schema in PRD §9): `venues` → `courts` → (`court_schedules`, `schedule_exceptions`, `pricing_rules`, `blocked_slots`, `reservations`) and `payments` (FK to reservation), plus `admin_users` and `audit_log`.

Pricing: `final_price = court.base_price_cents × multiplier`, where `multiplier` comes from the highest-`priority` matching row in `pricing_rules` (default 1.0).

Cancellation policy (PRD §11): user >24h = full refund; user <24h = no refund; admin = always full refund; admin force-majeure = full refund (separate button, refund via MP API, retry-on-failure flagged in `audit_log`).

## When implementing

- Validate all inputs with **Zod** at the boundary (Route Handlers, Server Actions).
- Rate-limit per PRD §16: 10/min booking creation, 100/min availability reads.
- The "2 canchas" are seed data in the initial migration, not hardcoded — the schema is multi-venue/multi-court from day 1. UI is single-venue in MVP.
- Cron jobs (Vercel Cron): reservation timeout sweep (every minute, cancels pending with `expires_at < now()`, reason `timeout`), MP reconciliation (every 5 minutes).
- Audit log writes are part of any sensitive mutation's transaction, not a fire-and-forget afterthought.

## Out of scope (PRD §4) — do not build

Native apps, multi-tenant UI, login, self-service reschedule (only cancel-and-rebook), WhatsApp Business API, dynamic pricing, weather/holiday API integrations, recording balance paid at venue.
