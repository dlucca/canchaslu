# Public Availability — Design Spec

**Fecha:** 2026-05-19
**Sub-proyecto:** 2 de N (anterior: setup + schema; siguientes: flujo de reserva, panel admin, MP, emails, crons)
**Estado:** Approved, listo para writing-plans

## Contexto

Primera feature usuario-facing. Implementa el flujo de descubrimiento del PRD §7 paso 1–2: selector de fecha y cancha, vista agenda en tiempo real, refresh al volver a la pestaña visible.

No habilita reservas todavía — tap en un slot disponible solo loguea. La transición pending → checkout MP va en sub-proyecto 3.

Schema y migraciones del sub-proyecto 1 son la base; este spec no las cambia.

## Alcance

### Incluye

1. `GET /api/courts` — lista las canchas activas del único venue MVP. Usado para poblar el selector.
2. `GET /api/availability?courtId=<uuid>&date=YYYY-MM-DD` — devuelve los slots del día con precio resuelto y flag de disponibilidad.
3. Lógica pura de generación de slots en `src/lib/availability.ts` (cero I/O, 100% testeable con datos sintéticos).
4. Lógica pura de resolución de precio en `src/lib/pricing.ts`.
5. Lógica pura de conversión de fecha local → rango UTC en `src/lib/timezone.ts`.
6. Queries Drizzle que alimentan la API en `src/db/queries/availability.ts` y `src/db/queries/courts.ts`.
7. Página `/` (Server Component) que hace SSR del estado inicial.
8. Componentes cliente para selectores + polling.
9. Tests unitarios de la lógica pura + 1–2 tests de integración API contra DB.

### No incluye

- Crear reserva (sub-proyecto 3). Cada slot disponible es un `<button>` que solo loguea por consola.
- Mostrar deposit cents o balance presencial.
- Cancelación, panel admin, auth, emails, MercadoPago, crons.
- Multi-venue (venue se asume único en MVP).
- Internacionalización (UI hardcoded en español rioplatense).
- Animaciones complejas (transitions sutiles CSS está bien; nada de Framer Motion).

## Decisiones tomadas

| Decisión | Alternativas descartadas | Razón |
|---|---|---|
| Una cancha a la vez (selector) | Mostrar todas las canchas mezcladas en la agenda | Menos denso, más mobile-friendly. PRD §7 lo describe así. |
| Un día a la vez (date picker) | Vista semanal multi-día | Bundle más chico, fetch más rápido, simpler UX. Plan §13 sugiere agenda vertical por día. |
| Slot ocupado → "No disponible" sin distinguir motivo | Mostrar "Reservado" vs "Bloqueado" | PRD §7 explícito: no revelar info operativa al público. |
| Precio total visible, sin deposit/balance breakdown | Mostrar 30% / 70% en cada slot | Pre-reserva no necesita ese detalle. Se muestra en form de reserva (sub-proyecto 3). |
| Polling cada 30s + visibilitychange | WebSocket / SSE | YAGNI. 30s alcanza para MVP. Real-time entra en V2 si los KPIs lo justifican. |
| `Cache-Control: no-store` en API | ISR / SWR cache 30s | Disponibilidad cambia con reservas concurrentes; preferimos consistencia sobre cache hit. El polling es del lado cliente. |
| `MIN_ANTICIPATION_MIN` y `MAX_ANTICIPATION_DAYS` hardcoded en `src/lib/constants.ts` | Columnas en `venues` table | PRD §11 dice configurable por venue, pero esa config es feature de admin panel (sub-proyecto 5). Por ahora constantes, migración cuando se necesite. |
| SSR del primer estado de la página | Full client-side fetch en `useEffect` | LCP target <2s en 4G (PRD §15). SSR provee contenido inmediato. |
| `<input type="date">` nativo para date picker | Library tipo `react-day-picker` | Cero bundle adicional, picker nativo del OS en mobile = mejor UX. |
| `Intl.DateTimeFormat` para formateo | `date-fns` / `dayjs` | Cero bundle adicional. Suficiente para necesidades MVP. |

## Estructura de archivos

```
src/
├── app/
│   ├── page.tsx                          # RSC: server-side initial fetch + render
│   └── api/
│       ├── availability/route.ts         # GET availability
│       └── courts/route.ts               # GET courts
├── lib/
│   ├── availability.ts                   # computeAvailableSlots(inputs) — pure
│   ├── pricing.ts                        # resolvePriceCents(...) — pure
│   ├── timezone.ts                       # dateToVenueRangeUtc(...) — pure
│   ├── constants.ts                      # MIN_ANTICIPATION_MIN, MAX_ANTICIPATION_DAYS
│   ├── format.ts                         # formatLocalTime, formatCurrency — pure
│   └── api-error.ts                      # standardized error shapes
├── db/
│   └── queries/
│       ├── availability.ts               # fetchAvailabilityInputs(courtId, date, venueTz)
│       └── courts.ts                     # fetchActiveCourts()
└── components/
    ├── agenda/
    │   ├── AgendaView.tsx                # Client: orchestrator (selectors + list + polling)
    │   ├── CourtSelect.tsx               # Client: court dropdown
    │   ├── DateSelect.tsx                # Client: date picker
    │   └── SlotCard.tsx                  # Presentational
    └── ui/                               # shadcn primitives (already exists)

tests/
├── lib/
│   ├── availability.test.ts              # Vitest unit, no DB
│   ├── pricing.test.ts                   # Vitest unit, no DB
│   └── timezone.test.ts                  # Vitest unit, no DB
└── api/
    └── availability.test.ts              # Integration: full API roundtrip with seeded DB
```

Boundaries: archivos en `src/lib/` no importan nada de `src/db/`. Archivos en `src/db/queries/` no formatean para UI, devuelven entidades crudas del schema. Route handlers son la única capa que orquesta query + lógica pura + serialización.

## Contrato de la API

### `GET /api/courts`

Sin parámetros (MVP es single-venue).

Response 200:
```json
{
  "courts": [
    {
      "id": "uuid",
      "name": "Cancha 1",
      "type": "f5",
      "surface": "sintetico",
      "covered": true
    }
  ]
}
```

Solo canchas con `active=true`. Ordenadas por `name` ascendente.

Errores: solo 500 en caso de DB caída.

### `GET /api/availability?courtId=<uuid>&date=YYYY-MM-DD`

Validación Zod del input:
- `courtId`: UUID v4
- `date`: regex `/^\d{4}-\d{2}-\d{2}$/`, parseable como fecha válida, dentro de `[today, today + MAX_ANTICIPATION_DAYS]`

Response 200:
```json
{
  "courtId": "uuid",
  "date": "2026-05-19",
  "timezone": "America/Argentina/Buenos_Aires",
  "currency": "ARS",
  "slots": [
    {
      "startsAtUtc": "2026-05-19T13:00:00.000Z",
      "endsAtUtc": "2026-05-19T14:00:00.000Z",
      "localStart": "10:00",
      "localEnd": "11:00",
      "priceCents": 1500000,
      "available": true
    }
  ]
}
```

`localStart`/`localEnd` están pre-formateados server-side para evitar logica de timezone en el cliente.

Errores:
- 400 `{ error: "validation_failed", issues: [...] }` con detalle Zod
- 404 `{ error: "court_not_found" }` si `courtId` no existe o `active=false`
- 500 `{ error: "internal", requestId: "<uuid>" }` con error logueado server-side

Headers: `Cache-Control: no-store`.

## Algoritmo de slots — `computeAvailableSlots`

Función pura, signature:

```ts
type Inputs = {
  court: { id: string; slotDurationMin: number; basePriceCents: number };
  schedule: { opensAt: string; closesAt: string } | null; // null = closed
  exception: { closed: boolean; opensAt: string | null; closesAt: string | null } | null;
  reservations: Array<{ startsAt: Date; endsAt: Date }>; // ya filtradas a status active
  blockedSlots: Array<{ startsAt: Date; endsAt: Date }>;
  pricingRules: Array<{ dayOfWeek: number | null; startTime: string | null; endTime: string | null; multiplier: number; priority: number; active: boolean }>;
  date: string; // 'YYYY-MM-DD' en venue timezone
  venueTimezone: string;
  now: Date;
};

type Slot = {
  startsAtUtc: Date;
  endsAtUtc: Date;
  localStart: string; // 'HH:mm'
  localEnd: string;
  priceCents: number;
  available: boolean;
};

function computeAvailableSlots(inputs: Inputs): Slot[];
```

Pasos:

1. **Determinar ventana de operación.**
   - Si `exception?.closed === true` → return `[]`.
   - Si `exception` con `opensAt && closesAt` → usar esa ventana.
   - Si no hay exception → usar `schedule`. Si `schedule === null` → return `[]`.

2. **Generar slots crudos.** Desde `opensAt` hasta `closesAt`, paso `slotDurationMin`. Cada slot es un par `[startsAtUtc, endsAtUtc]` convertido desde local time (date + opensAt) al UTC equivalente usando `venueTimezone`. El último slot debe terminar exactamente en `closesAt` o antes — si `slotDurationMin` no divide la ventana, descartar el último incompleto.

3. **Filtrar por anticipación.**
   - Descartar slots con `startsAtUtc < now + MIN_ANTICIPATION_MIN * 60_000`.
   - Descartar slots con `startsAtUtc > now + MAX_ANTICIPATION_DAYS * 86_400_000`.

4. **Marcar disponibilidad.** Un slot tiene `available=false` si:
   - Existe `r` en `reservations` con `r.startsAt < slot.endsAtUtc && r.endsAt > slot.startsAtUtc` (intersección), o
   - Existe `b` en `blockedSlots` con la misma intersección.

5. **Resolver precio.** Para cada slot, llamar `resolvePriceCents`.

6. **Formatear locales.** `localStart` y `localEnd` formateados con `Intl.DateTimeFormat('es-AR', { timeZone: venueTimezone, hour: '2-digit', minute: '2-digit', hour12: false })`.

7. **Ordenar por `startsAtUtc` ascendente.** Devolver array.

## Algoritmo de pricing — `resolvePriceCents`

```ts
function resolvePriceCents(
  basePriceCents: number,
  rules: PricingRule[],
  slot: { startsAtUtc: Date; localHourMinute: string }, // e.g. '19:30' en venue tz
  dayOfWeek: number, // 0..6 en venue tz
): number;
```

1. Filtrar `rules` por `active=true`.
2. Filtrar por match. Cada criterio es un filtro independiente: `null` = wildcard (siempre matchea), no-null = debe coincidir:
   - `rule.dayOfWeek`: si no-null, debe igualar `dayOfWeek`; si null, matchea cualquier día.
   - `rule.startTime` y `rule.endTime`: si ambos no-null, `slot.localHourMinute` debe estar en `[startTime, endTime)` (intervalo semi-abierto, comparación lexicográfica de strings HH:mm); si ambos null, matchea cualquier hora. Combinaciones mixtas (uno null, el otro no) son inválidas — el query layer las descarta loggeando warning.
   - Reglas con todos los criterios null = fallback general (matchea siempre, override del default 1.0 si tiene `priority` mayor que 0).
3. Ordenar matches por `priority` desc. Tomar el primero.
4. Si hay match → `Math.round(basePriceCents * multiplier)`. Si no → `basePriceCents`.

`multiplier` viene de la DB como string (numeric), parsearlo a number con `parseFloat` en el query layer.

## Algoritmo de timezone — `dateToVenueRangeUtc`

```ts
function dateToVenueRangeUtc(date: string, venueTimezone: string): { startUtc: Date; endUtc: Date };
```

Dada una fecha `YYYY-MM-DD` en el timezone del venue, devolver el rango `[00:00 local, 00:00 next-day local]` convertido a UTC. Lo usa el query layer para filtrar reservas y blocks que solapan con ese día.

Implementación: construir un `Date` desde el string con `toLocaleString` truco o `Intl.DateTimeFormat` para obtener offset. **DST-safe**: en AR no hay DST, pero la función debe ser correcta para timezones que sí lo tienen (otros venues futuros).

## Query layer — `fetchAvailabilityInputs`

```ts
async function fetchAvailabilityInputs(
  courtId: string,
  date: string,
): Promise<{
  court: Court;
  venue: Venue;
  schedule: CourtSchedule | null;
  exception: ScheduleException | null;
  reservations: Array<Pick<Reservation, 'startsAt' | 'endsAt'>>;
  blockedSlots: Array<Pick<BlockedSlot, 'startsAt' | 'endsAt'>>;
  pricingRules: PricingRule[];
} | null>;
```

Devuelve `null` si la cancha no existe o no está activa.

Una única operación que dispara 6 queries en paralelo con `Promise.all`:
1. Court por id (con join a venue)
2. `court_schedules` para el día de la semana
3. `schedule_exceptions` para esa fecha
4. `reservations` solapando el día y `status IN ('pending','confirmed')`
5. `blocked_slots` solapando el día
6. `pricing_rules` activas de la cancha

Si `court` no existe o `active=false` → return null sin disparar las otras queries (corto-circuito).

## Página `/` — UX y componentes

### Layout mobile-first

```
viewport ~ 375x812 (iPhone SE / 12 mini)

┌─────────────────────────────────┐
│  canchaslu                   ●  │  header ~56px, ● = indicador de auto-refresh activo
├─────────────────────────────────┤
│  ┌───────────────┐ ┌──────────┐ │
│  │ Cancha 1   ▾  │ │ Hoy   ▾  │ │  selectores ~48px alto, en parte superior
│  └───────────────┘ └──────────┘ │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────────┐│
│  │ 09:00 – 10:00      $15.000  ││  slot disponible
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ 10:00 – 11:00   No disponible││  slot ocupado, opacidad reducida
│  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│
│  │ 19:00 – 20:00      $22.500  ││  hora pico, mismo styling
│  └─────────────────────────────┘│
│  ...                            │
│                                 │
└─────────────────────────────────┘
```

Tap target mínimo 56px (PRD §6: operación con una mano).

### Componentes

**`AgendaView.tsx` (client component)**

Props: `{ initialCourts: Court[]; initialAvailability: AvailabilityResponse; initialCourtId: string; initialDate: string; }`

Estado interno:
- `courtId: string`
- `date: string`
- `availability: AvailabilityResponse | null`
- `loading: boolean`
- `error: string | null`

Effects:
- Cuando `courtId` o `date` cambia → fetch a `/api/availability` y actualizar `availability`.
- `setInterval` cada 30s → re-fetch si la pestaña está visible.
- Listener de `visibilitychange` → re-fetch inmediato al volver visible.

Cleanup: clear interval y remover listener en unmount.

URL sync: actualizar query params `?courtId=...&date=...` con `router.replace` (no `push`) cada vez que cambian, para que refrescar el browser preserve el estado.

**`CourtSelect.tsx`** — `<select>` nativo con `aria-label`. Bottom sheet sería más bonito pero el select nativo en mobile abre un picker OS-friendly y es cero overhead.

**`DateSelect.tsx`** — `<input type="date" min={today} max={today + 30d}>` nativo. Mismo razonamiento.

**`SlotCard.tsx`** — `<button disabled={!available}>`. Si `available`, onClick loguea `console.log('TODO: open reservation flow', slot)`. Estilos: `bg-primary` cuando disponible, `bg-muted opacity-60 cursor-not-allowed` cuando no.

### Loading y empty states

- **Loading inicial:** no aparece (SSR ya rinde la primera respuesta).
- **Loading en refresh:** indicador sutil ● en header, parpadea durante el fetch. No bloquea la UI con skeleton.
- **Empty (cancha cerrada ese día):** mensaje centrado "La cancha está cerrada esta fecha." con botón para cambiar fecha.
- **Empty (todas ocupadas):** lista con todos los slots en "No disponible". Header agrega "Sin disponibilidad este día. Probá otra fecha."

### Error states

- **400 (input inválido):** toast "Datos inválidos" + revertir el selector al último valor válido.
- **404 (cancha no encontrada):** toast "Cancha no encontrada" + volver al primer court de la lista.
- **500 / network error:** banner persistente "Error de conexión. Reintentando…" con countdown 5s al próximo retry.

Toasts via shadcn `<Toaster />`. Si la lib no está instalada, instalarla en el primer task del plan.

## Constants

`src/lib/constants.ts`:

```ts
export const MIN_ANTICIPATION_MIN = 30;
export const MAX_ANTICIPATION_DAYS = 30;
export const REFRESH_INTERVAL_MS = 30_000;
export const ERROR_RETRY_MS = 5_000;
```

## Testing

### Unit tests (Vitest, sin DB)

**`tests/lib/availability.test.ts`** — 8 casos:
1. Day con schedule normal genera N slots correctos.
2. `exception.closed=true` → `[]`.
3. `exception` con override de horario → usa ese horario, no el del schedule.
4. `schedule=null` y sin exception → `[]`.
5. `slot.startsAt < now + 30min` → excluido.
6. `slot.startsAt > now + 30d` → excluido.
7. Slot solapado por reserva pending → `available=false`.
8. Slot solapado por blocked_slot → `available=false`.

**`tests/lib/pricing.test.ts`** — 4 casos:
1. Sin rules → multiplier 1.0.
2. Rule de day_of_week sin time range → aplica si matchea día.
3. Rule con time range → aplica solo dentro del rango.
4. Múltiples rules matchean → gana la de mayor `priority`.

**`tests/lib/timezone.test.ts`** — 1 caso crítico:
1. Convierte `2026-06-15` (verano AR, UTC-3) → `[2026-06-15T03:00:00Z, 2026-06-16T03:00:00Z]`.

### Integration test (con DB, requiere `DATABASE_URL_TEST`)

**`tests/api/availability.test.ts`** — 1 caso end-to-end:
1. Con DB seedeada (1 venue + 2 courts + schedules + peak pricing), `GET /api/availability?courtId=<cancha1>&date=<hoy+1>` devuelve slots con precio pico aplicado de 19-23 si el día es L-V.

Se ejecuta con vitest contra una Supabase de test.

## Performance

- **LCP <2s en 4G:** SSR del primer estado + zero render-blocking assets.
- **TTI <3s:** bundle del client component bajo 50KB gzipped. Sin libs de date/time.
- **API latency <300ms p95:** 6 queries en paralelo con `Promise.all`. Drizzle compila la query una vez (lo maneja el driver).

Lighthouse mobile target > 90.

## Criterio de "done"

- [ ] `GET /api/courts` y `GET /api/availability` corren contra Supabase y responden los contratos arriba.
- [ ] Página `/` rinde SSR con cancha+fecha default, agenda visible al primer paint.
- [ ] Selector de cancha y fecha funcionan; URL refleja el estado.
- [ ] Auto-refresh cada 30s + en `visibilitychange`.
- [ ] Slots ocupados (por reserva o bloqueo) se renderean como "No disponible" sin distinguir.
- [ ] Slot de L-V 19-23 muestra precio con multiplier 1.5 aplicado.
- [ ] 14 tests unitarios pasan (8 availability + 4 pricing + 1 timezone + el resto si surgen).
- [ ] 1 test de integración API pasa.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` OK.
- [ ] Deploy a Vercel sirve la nueva página.
- [ ] Lighthouse mobile > 90 en `/`.

## Riesgos / cosas a vigilar

- **Timezone correctness en bordes.** AR no tiene DST pero queremos que la función sea robusta para futuros venues. Test cubre el caso AR; tests adicionales con un tz con DST (e.g. `America/New_York`) son opcionales pero recomendables.
- **Polling agresivo en muchas pestañas abiertas.** 30s × N tabs puede generar carga. Acción: pausar interval cuando `document.hidden` (`visibilitychange` listener) — ya está en el diseño.
- **Pricing rules con rango horario que cruza medianoche** (e.g. 22:00–02:00). El schema no lo prohíbe pero nuestra lógica de `[startTime, endTime)` no lo soporta. Acción: el seed no tiene casos así; documentar la limitación en la doc de pricing. Si admin necesita esto, se resuelve en sub-proyecto 5 (pricing admin UI).
- **Slot que aparece disponible pero al hacer reserva (sub-proyecto 3) ya está tomado.** Diseño: la creación de reserva fallará con la EXCLUDE constraint y el form mostrará "Ese horario se acaba de tomar. Refrescá la agenda." Manejado en sub-proyecto 3.
- **Cantidad de slots por día.** Una cancha 9-23 con duración 60min = 14 slots. Dos canchas = irrelevante (cada llamada solo trae una). No hay riesgo de payload grande.

## Sub-proyectos siguientes (recordatorio)

3. **Flujo de reserva guest end-to-end:** form al hacer tap en slot disponible, crear `pending`, preferencia MP, redirect a Checkout Pro, webhook idempotente, transición a `confirmed`, email de confirmación, cron de timeout.
4. **Cancelación pública:** JWT token, página de cancelación, política 24h, refund MP.
5. **Panel admin:** Supabase Auth, dashboard del día, CRUD canchas/horarios/pricing, gestión manual de reservas, audit log.
6. **Reconciliación + observabilidad:** cron MP, Sentry, logs estructurados.
