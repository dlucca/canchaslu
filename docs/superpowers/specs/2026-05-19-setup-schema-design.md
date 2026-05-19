# Setup + Schema + Migraciones — Design Spec

**Fecha:** 2026-05-19
**Sub-proyecto:** 1 de N (siguientes: flujo de reserva guest, panel admin, integración MP, emails, crons)
**Estado:** Approved, listo para writing-plans

## Contexto

Este es el primer sub-proyecto derivado del [PRD v3](../../../PRD-Canchas-Futbol-v3.md). El PRD está cerrado y sus decisiones (§20) no se re-litigan acá. Las invariantes arquitectónicas están en [CLAUDE.md](../../../CLAUDE.md) y este spec las implementa.

El objetivo es dejar el repo en estado "cualquier feature subsiguiente puede empezar a tocar código sin pelearse con setup". No hay UI ni endpoints en este sub-proyecto.

## Alcance

### Incluye

1. Repo inicializado: Next.js 15 (App Router) + TypeScript estricto, pnpm, ESLint, Prettier, `.gitignore`, `README.md` mínimo.
2. TailwindCSS + shadcn/ui inicializados (configurados, sin componentes consumidos todavía).
3. Drizzle ORM + drizzle-kit configurados contra Supabase Postgres hosted.
4. Schema completo de PRD §9 traducido a Drizzle: todas las tablas, todos los enums, todas las FKs.
5. Migración SQL escrita a mano para lo que Drizzle no emite: `btree_gist`, generated `tstzrange` columns, `EXCLUDE USING gist` constraint, trigger `updated_at`, trigger anti-overlap entre `blocked_slots` y `reservations`.
6. Seed script con: 1 venue, 2 courts, schedules default, 1 pricing_rule de ejemplo.
7. Vitest configurado con un par de tests de integración contra DB que validan las invariantes críticas (exclusion constraint y trigger anti-overlap).
8. `.env.example` con todas las variables del proyecto (incluso las que no usamos en este sub-proyecto, marcadas como `# unused in sub-project 1`).
9. Scripts npm: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:reset`.

### No incluye (queda para sub-proyectos siguientes)

- Cualquier Route Handler, Server Action, o página más allá del scaffold default de Next.js.
- Supabase Auth (admin login).
- Integración con MercadoPago, Resend, Sentry.
- Vercel Cron jobs.
- Componentes shadcn/ui consumidos por features.
- CI/CD.

## Stack y decisiones concretas

| Pieza | Decisión | Razón |
|---|---|---|
| Package manager | pnpm | Más rápido, store global, lockfile determinístico. Default moderno en Next.js. |
| Node | 20 LTS (especificado en `engines` y `.nvmrc`) | Estable, soportado por Vercel y Supabase. |
| Next.js | 15.x App Router | Decisión cerrada en PRD §5. |
| TypeScript | Strict mode + `noUncheckedIndexedAccess` | Atrapa bugs reales antes de runtime. |
| Drizzle migrations | `drizzle-kit generate` para migraciones triviales + SQL escrito a mano para constraints/triggers especiales | Drizzle no emite GIST exclusion constraints ni generated columns con `tstzrange`. |
| Conexión DB | Dos URLs: `DATABASE_URL` (pooler PgBouncer transaction-mode, para runtime) y `DIRECT_URL` (no-pooler, para migraciones) | Pooler no soporta sessions necesarias para migraciones; runtime serverless necesita pooler. Patrón estándar Supabase. |
| Driver | `postgres` (porsager) con Drizzle | Soportado oficialmente, funciona en edge y node, simple. |
| Testing | Vitest | Rápido, ESM nativo, buena DX. |
| Lint/format | ESLint (config Next.js) + Prettier | Default. |

## Estructura de archivos

```
canchaslu/
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierrc
├── CLAUDE.md
├── PRD-Canchas-Futbol-v3.md
├── README.md
├── docs/superpowers/specs/
├── drizzle.config.ts
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── components.json                  # shadcn config
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx               # scaffold default, sin contenido propio
│   │   ├── page.tsx                 # placeholder "canchaslu — en construcción"
│   │   └── globals.css
│   ├── db/
│   │   ├── index.ts                 # exporta `db` (drizzle client)
│   │   ├── schema/
│   │   │   ├── index.ts             # re-exporta todo
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
│   │   │   ├── meta/                # drizzle-kit metadata
│   │   │   ├── 0000_init.sql        # generado por drizzle-kit
│   │   │   └── 0001_constraints_triggers.sql   # escrito a mano
│   │   └── seed.ts
│   └── lib/                         # vacío por ahora; lo llenan los sub-proyectos siguientes
└── tests/
    └── db/
        ├── exclusion-constraint.test.ts
        └── blocked-slots-trigger.test.ts
```

## Schema — notas de implementación

Las tablas siguen literal el PRD §9. Algunos puntos donde la traducción a Drizzle merece nota:

### `reservations`

- `time_range tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED` se declara en la migración SQL escrita a mano, no en Drizzle. En el schema Drizzle, `timeRange` se declara como `customType` de solo lectura para que aparezca en queries pero Drizzle no intente insertarlo.
- `EXCLUDE USING gist (court_id WITH =, time_range WITH &&) WHERE (status IN ('pending', 'confirmed'))` también va en SQL escrito a mano.
- Enum `cancellation_reason` incluye los 4 valores del PRD: `user`, `admin`, `admin_force_majeure`, `timeout`.
- Enum `created_by`: `guest`, `admin`, `operator`.

### `blocked_slots`

- Mismo patrón `tstzrange` generated.
- Trigger `check_blocked_slot_no_overlap_with_reservations`: en `BEFORE INSERT OR UPDATE`, hace `SELECT 1 FROM reservations WHERE court_id = NEW.court_id AND status IN ('pending','confirmed') AND time_range && NEW.time_range`. Si encuentra, `RAISE EXCEPTION`.
- Trigger recíproco `check_reservation_no_overlap_with_blocked_slots`: en `BEFORE INSERT OR UPDATE` sobre `reservations`, hace el chequeo inverso.

### `updated_at`

Trigger genérico:
```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```
Aplicado a toda tabla con columna `updated_at` (venues, courts, reservations, payments, admin_users).

### Tipos monetarios

Todas las columnas `*_cents` son `integer` en Drizzle (`integer` no `numeric`). PRD §9 invariante.

### Timestamps

Todas las columnas de fecha/hora son `timestamp({ withTimezone: true, mode: 'date' })` en Drizzle. Las columnas `date` puras (`schedule_exceptions.date`) son `date({ mode: 'string' })` para evitar líos de timezone en serialización.

## Migraciones — flujo

1. `pnpm db:generate` corre `drizzle-kit generate` y produce `0000_init.sql` desde el schema TS.
2. `0001_constraints_triggers.sql` está versionado en el repo, escrito a mano, contiene:
   - `CREATE EXTENSION IF NOT EXISTS btree_gist;`
   - `ALTER TABLE reservations ADD COLUMN time_range ... GENERATED ALWAYS AS ... STORED;`
   - `ALTER TABLE blocked_slots ADD COLUMN time_range ... GENERATED ALWAYS AS ... STORED;`
   - `ALTER TABLE reservations ADD CONSTRAINT no_overlap_active_reservations EXCLUDE USING gist (...) WHERE (status IN ('pending','confirmed'));`
   - Triggers `updated_at` y los dos triggers anti-overlap.
3. `pnpm db:migrate` corre todas las migraciones en orden contra `DIRECT_URL`. Implementa `drizzle-orm/postgres-js/migrator` con un journal personalizado que también ejecuta los `.sql` escritos a mano.
4. `pnpm db:reset`: drop schema public + recreate + migrate + seed. Solo para dev/test.

## Seed

```ts
// pseudocode
const venue = await db.insert(venues).values({
  name: 'Complejo Demo',
  address: 'TBD',
  timezone: 'America/Argentina/Buenos_Aires',
  currency: 'ARS',
  depositPct: 30,
}).returning();

const [court1, court2] = await db.insert(courts).values([
  { venueId: venue.id, name: 'Cancha 1', type: 'f5', surface: 'sintetico', covered: true,  slotDurationMin: 60, basePriceCents: 1500000 },
  { venueId: venue.id, name: 'Cancha 2', type: 'f7', surface: 'sintetico', covered: false, slotDurationMin: 60, basePriceCents: 2500000 },
]).returning();

// schedules: 9:00–23:00 los 7 días para ambas canchas
for (const court of [court1, court2]) {
  for (let dow = 0; dow <= 6; dow++) {
    await db.insert(courtSchedules).values({ courtId: court.id, dayOfWeek: dow, opensAt: '09:00', closesAt: '23:00' });
  }
}

// pricing rule de ejemplo: L–V 19:00–23:00 multiplier 1.5
for (const court of [court1, court2]) {
  for (let dow = 1; dow <= 5; dow++) {
    await db.insert(pricingRules).values({ courtId: court.id, dayOfWeek: dow, startTime: '19:00', endTime: '23:00', multiplier: '1.50', priority: 10 });
  }
}
```

Seed es idempotente: chequea si ya existe el venue por `name = 'Complejo Demo'` y aborta si sí (para no duplicar al correr `db:seed` dos veces sin reset).

## Variables de entorno

`.env.example` contiene todas las variables del proyecto completo. Las no usadas en este sub-proyecto van marcadas:

```
# --- DB (sub-project 1) ---
DATABASE_URL=
DIRECT_URL=
DATABASE_URL_TEST=             # base separada para `pnpm test`, se resetea entre tests

# --- Supabase (sub-project 1: solo URL/keys, sin auth todavía) ---
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

Validación de envs en `src/lib/env.ts` con Zod (solo las usadas en este sub-proyecto). El resto se valida cuando los sub-proyectos siguientes las consuman.

## Tests de integración

Solo dos tests, ambos chequean invariantes que el PRD no nos perdona romper:

### `exclusion-constraint.test.ts`

```
1. seed limpio (venue + courts)
2. insert reserva A en court_1 [10:00, 11:00) con status='pending' → ok
3. insert reserva B en court_1 [10:30, 11:30) con status='pending' → debe fallar con violación de exclusion constraint
4. cambiar A.status='cancelled'
5. insert B otra vez → ahora debe pasar (cancelled no cuenta en el WHERE)
6. insert reserva C en court_2 [10:00, 11:00) → debe pasar (otro court_id)
```

### `blocked-slots-trigger.test.ts`

```
1. insert reserva A en court_1 [10:00, 11:00) status='confirmed'
2. insert blocked_slot en court_1 [10:30, 11:30) → debe fallar por trigger
3. insert blocked_slot en court_1 [12:00, 13:00) → debe pasar
4. insert reserva B en court_1 [12:30, 13:30) → debe fallar por trigger recíproco
```

Tests corren contra una base de datos de test separada (`DATABASE_URL_TEST`). Cada test resetea con `db:reset` antes de correr. No paralelizan (single connection, single DB).

## Criterio de "done"

- [ ] `pnpm install` limpio
- [ ] `pnpm db:reset` ejecuta migraciones y seed sin errores
- [ ] `pnpm dev` levanta el scaffold default sin warnings
- [ ] `pnpm build` produce un build estático del placeholder
- [ ] `pnpm typecheck` pasa
- [ ] `pnpm lint` pasa
- [ ] `pnpm test` corre los dos tests de integración y pasan
- [ ] El repo se puede clonar fresh y, con un Supabase nuevo, llegar de cero a "db migrada y seedeada" siguiendo solo el README

## Riesgos / cosas a vigilar

- **Drizzle + tstzrange generated columns**: Drizzle no tiene soporte nativo. Hay que declarar la columna con `customType` que solo se lee, y emitir la columna real desde la migración SQL escrita a mano. Si Drizzle re-genera la migración inicial, va a querer ALTER la tabla para "agregar" la columna que ya creamos a mano — hay que asegurarse de que la migración 0000 NO incluya `time_range` y que la 0001 la agregue una sola vez.
- **Migraciones a mano + drizzle-kit**: si después agregamos columnas vía `db:generate`, drizzle-kit puede intentar "diff" contra el schema real y proponer cosas raras. Documentar en el README que cualquier ALTER sobre tablas con `time_range` requiere chequear el SQL generado.
- **Pooler vs direct**: olvidar usar `DIRECT_URL` para migraciones causa errores crípticos. El script `db:migrate` debe usar explícitamente `DIRECT_URL` y fallar fuerte si no está definido.

## Siguientes sub-proyectos (no en este spec)

Orden tentativo, cada uno con su propio brainstorm/spec/plan:

2. **Disponibilidad pública (read-only)**: endpoint y página que listan slots disponibles para una fecha y court dados, aplicando schedules + exceptions + reservas activas + blocked_slots + pricing rules.
3. **Flujo de reserva guest end-to-end**: crear pending, crear preference MP, redirect a Checkout Pro, webhook handler con idempotencia y verificación HMAC, transición a confirmed, email de confirmación, cron de timeout.
4. **Cancelación pública**: token JWT, página de cancelación, política 24h, refund vía MP API.
5. **Panel admin**: Supabase Auth, dashboard del día, CRUD canchas/horarios/pricing, gestión manual de reservas, botón "cancelar con refund", audit log viewer.
6. **Reconciliación + observabilidad**: cron de reconciliación MP, Sentry, logs estructurados.
