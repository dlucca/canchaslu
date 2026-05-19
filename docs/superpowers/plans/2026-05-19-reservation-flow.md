# Sub-proyecto 3 — Plan (sin Resend, sin custom domain)

## Context

El usuario quiere implementar el sub-proyecto 3 (flujo de reserva guest end-to-end con MercadoPago) **sin enviar emails y sin dominio custom** para el MVP. Esta es la pieza más sustantiva del producto: el form al tocar un slot, la creación de la reserva en estado `pending`, la integración con MercadoPago Checkout Pro, el webhook con verificación HMAC e idempotencia, las páginas de retorno, y el cron de timeout.

El recorte de scope tiene impacto concreto sobre la entrega del link de cancelación: sin email, el único canal para que el usuario lo guarde es la página `/r/[id]/success` después de pagar. Eso obliga a hacer esa página un poco más rica (incluye link de cancelación + botón "compartir por WhatsApp" para que el usuario pueda auto-enviarse el link).

El resultado esperado: un guest puede reservar y pagar end-to-end, recibir confirmación on-screen con todos los datos (incluyendo link de cancelación y botón .ics), y el sistema gestiona timeouts automáticamente. El feature de cancelación pública per se (página `/cancel?token=...`) queda para el sub-proyecto 4. La reconciliación contra el API de MercadoPago y Sentry quedan para el sub-proyecto 6. El refund automático queda para el sub-proyecto 4.

## Decisiones nuevas (forzadas por el recorte)

| Decisión | Razón |
|---|---|
| **No instalar Resend ni dep de email.** Tampoco `RESEND_API_KEY` ni `RESEND_FROM_EMAIL` en env. | Recorte explícito del usuario. |
| **No agregar dominio custom.** `NEXT_PUBLIC_APP_URL = https://canchaslu.vercel.app` queda. MP back_urls usan ese host. | Recorte explícito del usuario. |
| **Sí generar `cancellation_token` (JWT) y guardarlo en la reserva.** Mostrarlo en `/r/[id]/success` con copy button y "compartir por WhatsApp". | Sin email, esta página es el único canal para entregar el token. La página de cancelación que lo consume se construye en sub-proyecto 4. |
| **`/r/[id]/success` enriquecida con `.ics` download + Maps deep link + WhatsApp share del link de cancel.** | Reemplaza la utilidad del email. PRD §7 paso 5 lista estos botones igual. |
| **El webhook handler ya no manda email post-commit.** Termina al insertar audit_log y commitear. | Sin Resend, no hay paso de email. |

Todo el resto del diseño propuesto en el brainstorming (MP wrapper testeable, HMAC + idempotencia + transacción atómica, JWT con HS256, .ics función pura, cron via vercel.json, bottom sheet, Route Handler `POST /api/reservations`) **queda como estaba**.

## Alcance

### Incluye

1. **Bottom sheet de reserva** al tocar slot disponible (form: nombre, WhatsApp E.164, email opcional).
2. **`POST /api/reservations`**: Zod-valida, re-calcula precio + deposit server-side (no confía en el cliente), genera `cancellation_token` JWT, inserta `pending` con `expires_at = now + 15min`, crea preference MP, devuelve `{ checkoutUrl, reservationId }`. Maneja conflict 409 si la EXCLUDE constraint rechaza.
3. **Redirect a Checkout Pro**: client hace `window.location = checkoutUrl`.
4. **Páginas de retorno**: `/r/[id]/success`, `/r/[id]/failure`, `/r/[id]/pending` (MP back_urls).
5. **`/r/[id]/success` enriquecida**: muestra detalles de la reserva, link de cancelación con copy, botón "compartir por WhatsApp" (deep link `wa.me` con el cancel URL prearmado), descarga `.ics`, botón "Abrir en Maps". Polling cada 2s hasta 30s si la reserva todavía está `pending` (caso de webhook lento).
6. **`POST /api/webhooks/mercadopago`**: verifica HMAC `x-signature`, idempotente por `provider_event_id`, re-fetch del payment al MP API, transacción atómica que actualiza `reservation` + inserta `payments` + inserta `audit_log`.
7. **`GET /api/cron/expire-reservations`**: cancela `pending` con `expires_at < now` y libera el slot. Protegido con `Authorization: Bearer ${CRON_SECRET}`. Schedule `* * * * *` en `vercel.json`.
8. **Wrappers testeables**: `src/lib/mercadopago.ts` (interfaz `MercadoPagoClient`) y `src/lib/webhook-signature.ts` (verificación HMAC pura).
9. **`src/lib/ics.ts`**: función pura que genera VCALENDAR válido para una reserva.
10. **`src/lib/cancellation-token.ts`**: sign/verify JWT HS256.
11. **`src/lib/reservation-pricing.ts`**: re-usa `resolvePriceCents` de sub-proyecto 2, agrega cálculo de deposit.
12. **Tests unitarios** de las libs puras (≥10 casos entre cancellation-token, ics, webhook-signature, reservation-pricing).

### Fuera de alcance

- Envío de emails (recorte del usuario).
- Dominio custom (recorte del usuario).
- Página de cancelación `/cancel?token=...` → sub-proyecto 4.
- Refund automático vía MP API → sub-proyecto 4.
- Reconciliación cron cada 5min contra MP → sub-proyecto 6.
- Sentry y logs estructurados centralizados → sub-proyecto 6.
- Panel admin → sub-proyecto 5.
- Recordatorios pre-reserva → sub-proyecto futuro.
- WhatsApp Business API → sub-proyecto V2.

## Bloqueos externos que el usuario tiene que resolver

Antes de poder testear end-to-end:

1. **Cuenta MercadoPago developer** + crear aplicación + obtener `Access Token` TEST.
2. **Webhook Secret** desde el panel de la aplicación MP (para verificar `x-signature`).
3. **Usuario de prueba MP** (test buyer + test seller) para pagar sin plata real.
4. **`CANCELLATION_TOKEN_SECRET`** generado por el usuario (random 32 bytes, `openssl rand -hex 32`).
5. **`CRON_SECRET`** generado por el usuario (random 32 bytes).
6. **Cargar las 5 vars en Vercel** (production + preview + development).

Ninguno bloquea escribir el código, solo el smoke test final.

## Estructura de archivos

```
canchaslu/
├── vercel.json                                # CREATE: cron config
├── src/
│   ├── app/
│   │   ├── page.tsx                           # MODIFY: SlotCard onSelect abre ReservationSheet
│   │   ├── r/
│   │   │   └── [id]/
│   │   │       ├── success/page.tsx           # CREATE
│   │   │       ├── failure/page.tsx           # CREATE
│   │   │       └── pending/page.tsx           # CREATE
│   │   └── api/
│   │       ├── reservations/route.ts          # CREATE: POST
│   │       ├── webhooks/
│   │       │   └── mercadopago/route.ts       # CREATE: POST
│   │       └── cron/
│   │           └── expire-reservations/route.ts  # CREATE: GET
│   ├── lib/
│   │   ├── mercadopago.ts                     # CREATE: MercadoPagoClient wrapper
│   │   ├── webhook-signature.ts               # CREATE: pure verifyMpSignature
│   │   ├── cancellation-token.ts              # CREATE: sign/verify JWT
│   │   ├── ics.ts                             # CREATE: buildIcsEvent pure
│   │   ├── reservation-pricing.ts             # CREATE: computeReservationPrice pure
│   │   └── env.ts                             # MODIFY: agregar MP_*, CRON_SECRET, CANCELLATION_TOKEN_SECRET
│   ├── db/
│   │   └── queries/
│   │       ├── reservations.ts                # CREATE: createPending, findById, transitionToConfirmed (en tx), expireOverdue
│   │       └── payments.ts                    # CREATE: insertOrIgnoreByProviderEvent
│   └── components/
│       ├── agenda/
│       │   ├── AgendaView.tsx                 # MODIFY: pasar onSelect a SlotCard que abre sheet
│       │   └── ReservationSheet.tsx           # CREATE: bottom sheet con form
│       └── ui/
│           └── sheet.tsx                      # ADD: shadcn add sheet
└── tests/
    └── lib/
        ├── cancellation-token.test.ts         # CREATE
        ├── ics.test.ts                        # CREATE
        ├── webhook-signature.test.ts          # CREATE
        └── reservation-pricing.test.ts        # CREATE
```

Re-uso de sub-proyecto 2:
- `src/lib/timezone.ts:dateToVenueRangeUtc` para validar la fecha del slot.
- `src/lib/pricing.ts:resolvePriceCents` dentro de `reservation-pricing.ts` para reconstruir el precio del slot server-side.
- `src/db/queries/availability.ts:fetchAvailabilityInputs` no se usa directamente — la creación trae la cancha + pricing rules en una query nueva, pero el patrón de query layer es el mismo.

Re-uso de sub-proyecto 1:
- Schema completo (reservations, payments, audit_log, blocked_slots, courts, venues).
- EXCLUDE constraint sobre `reservations` (es la línea de defensa anti-double-booking).
- Trigger updated_at.

## Algoritmos clave

### `computeReservationPrice(court, pricingRules, slot, venueTz, depositPct)`

Re-usa `resolvePriceCents` pasando el `localStart` y `dayOfWeek` derivados del `startsAt`. Devuelve `{ totalCents, depositCents }`. Asume slot único de duración `court.slot_duration_min`. Puro.

### `verifyMpSignature(rawBody, headers, secret)`

Lee header `x-signature` con formato `ts=<unix>,v1=<hex>` y header `x-request-id`. Construye string `id:<payment_id>;request-id:<x-request-id>;ts:<ts>;` (el `payment_id` viene del body o del query param `?data.id=`). Calcula HMAC-SHA256 con `secret`. Compara con `v1` en timing-safe. Rechaza si `ts` es de más de 5min (anti-replay). Función pura.

### Webhook handler

```
1. Read raw body + headers
2. Parse body to extract payment_id (body.data.id) — also accept ?data.id=
3. verifyMpSignature(rawBody, headers, secret) — si falla → 401
4. db.query payments where provider_event_id = payment_id — si existe → return 200 (idempotency)
5. MP.getPayment(payment_id) → { status, external_reference, transaction_amount, ... }
6. reservation_id = external_reference
7. db.transaction:
    a. lock reservations FOR UPDATE where id = reservation_id
    b. if reservation.status !== 'pending' → log + skip transition (race: ya confirmada o cancelada)
    c. if mp.status === 'approved' → update reservation set status='confirmed', paymentStatus='paid_deposit', paymentMethod='mercadopago'
    d. insert payments { reservationId, provider:'mercadopago', providerPaymentId:payment_id, providerEventId:payment_id, amountCents:transaction_amount*100, status:mp.status, rawPayload, webhookReceivedAt:now, capturedAt: mp.status==='approved' ? now : null }
    e. insert audit_log { entityType:'reservation', entityId:reservation_id, action:'webhook_processed', actorType:'webhook', diff:{from:'pending',to:'confirmed'} }
8. commit
9. return 200
```

Sin paso de email post-commit.

### Cron handler

```ts
export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('forbidden', { status: 401 });
  }
  const expired = await db
    .update(reservations)
    .set({ status: 'cancelled', cancellationReason: 'timeout', cancelledAt: new Date() })
    .where(and(eq(reservations.status, 'pending'), lt(reservations.expiresAt, new Date())))
    .returning({ id: reservations.id });
  console.log(JSON.stringify({ level: 'info', route: 'cron/expire', count: expired.length }));
  return Response.json({ expired: expired.length });
}
```

`vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "* * * * *" }] }
```

## Flujo end-to-end (sin email)

```
1. User toca slot disponible en /
2. ReservationSheet abre con resumen + form
3. Submit → POST /api/reservations
4. Server: Zod valida; re-calcula precio; genera JWT token; INSERT pending; crea MP preference;
   devuelve { checkoutUrl, reservationId }
5. Client: window.location = checkoutUrl
6. User paga en MP test
7. Paralelo:
   a. MP redirige a /r/[id]/success
   b. MP llama POST /api/webhooks/mercadopago
8. Webhook: HMAC ok → idempotency check → MP.getPayment → transaction → reservation.status='confirmed'
9. /r/[id]/success:
   - Si reservation.status === 'confirmed' → muestra:
     * Detalles (cancha, fecha, hora, monto pagado, balance a pagar en complejo)
     * Botón "Compartir por WhatsApp" (deep link wa.me/?text= con cancel URL pre-armado)
     * Link de cancelación + botón copy
     * Botón "Agregar al calendario" → descarga .ics
     * Botón "Abrir en Google Maps"
   - Si status === 'pending' → spinner + polling de fetch(`/r/[id]/api/status`) cada 2s hasta 30s
   - Si status === 'cancelled' (timeout entre redirect y refresh) → mensaje + CTA volver a /
```

## Edge cases

| Caso | Manejo |
|---|---|
| Slot tomado entre tap y submit | EXCLUDE viola → catch error → 409 con mensaje "Ese horario se acaba de tomar. Refrescá la agenda." |
| User cierra browser durante checkout | Cron de 1min expira → cancela → libera |
| Webhook llega antes del redirect | /success ya ve `confirmed` directo |
| Webhook nunca llega (red caída de MP) | Reserva queda `pending` y expira por timeout. La reconciliación cron de sub-proyecto 6 cubrirá este caso retroactivamente |
| Webhook duplicado | `provider_event_id` UNIQUE rechaza el INSERT → catch → 200 sin reprocess |
| HMAC inválido | 401 + console.error (Sentry en sub-proyecto 6) |
| Pago aprobado pero reserva ya cancelada por timeout | Webhook handler detecta `status !== 'pending'`, no transitionsa, inserta payment como `approved` + audit_log con flag "late". Refund logic queda para sub-proyecto 4 |
| Form con email malformado | Zod 400 inline |
| WhatsApp en formato no-E.164 | Regex `/^\+[1-9]\d{6,14}$/` en Zod |

## Variables de entorno nuevas

```
# MercadoPago
MP_ACCESS_TOKEN=               # APP_USR-... (test o prod)
MP_WEBHOOK_SECRET=             # del dashboard MP

# Cancellation token JWT
CANCELLATION_TOKEN_SECRET=     # `openssl rand -hex 32`

# Vercel Cron
CRON_SECRET=                   # `openssl rand -hex 32`
```

(NO se agregan `RESEND_API_KEY` ni `RESEND_FROM_EMAIL` por el recorte.)

`env.ts` se actualiza para validar las nuevas requeridas. `.env.example` también.

## Testing

### Unit (sin DB, sin red)

- `tests/lib/cancellation-token.test.ts` (3-4 casos): sign + verify roundtrip; token expired; firma manipulada; payload con reservationId.
- `tests/lib/ics.test.ts` (2-3 casos): output VCALENDAR válido; UID estable por reservation_id; DTSTART/DTEND en formato UTC.
- `tests/lib/webhook-signature.test.ts` (3-4 casos): firma válida; firma inválida; ts viejo (>5min); secret distinto.
- `tests/lib/reservation-pricing.test.ts` (3-4 casos): slot fuera de hora pico = precio base; slot en hora pico = base × 1.5; deposit redondeado correctamente; multiplier custom de venue.

### Integration (opt-in, requiere DATABASE_URL_TEST)

- No hago tests de integración nuevos para sub-proyecto 3 — el flujo es muy externo (MP) y la verificación final es manual E2E con cuenta test.

### Manual E2E

- En Vercel preview deploy: tap slot → form → submit → checkout → pagar con test buyer → volver a /success con `confirmed` + token visible. Verificar audit_log y payments en Supabase.

## Verification

Pasos para verificar el deploy end-to-end:

1. Local: `pnpm test` debe pasar 30+ tests (20 anteriores + 10+ nuevos).
2. Local: `pnpm typecheck && pnpm lint && pnpm build` limpios.
3. Push branch + abrir PR → Vercel crea preview deploy.
4. En el preview, abrir la app desde mobile (o DevTools mobile), tocar un slot disponible.
5. Completar form con datos de prueba (nombre real, +5491100000000, email opcional).
6. Submit → verificar que el browser redirige al checkout de MP.
7. Pagar con un test buyer MP (configurado previamente).
8. Verificar que MP redirige de vuelta a `/r/[id]/success` con el deploy URL.
9. /success debe mostrar status `confirmed` (puede tardar 1-2s si el webhook no llegó todavía — la página polea).
10. Verificar contenido de /success: detalles, copy del cancel URL, .ics download, Maps link, WhatsApp share.
11. En Supabase: verificar que la fila `reservations` está `confirmed`, hay un `payments` row con `provider_event_id`, y hay un `audit_log` row.
12. Test del cron: en Vercel dashboard → Crons, gatillar manualmente el job. Verificar que no falla. Crear una reserva pending con `expires_at` en el pasado vía consola SQL → re-correr cron → verificar que pasa a `cancelled` con reason `timeout`.

## Archivos críticos a modificar (resumen ejecutivo)

- **`src/lib/env.ts`** — agregar 3 nuevas vars requeridas
- **`src/lib/mercadopago.ts`** (nuevo) — wrapper MP
- **`src/lib/webhook-signature.ts`** (nuevo) — HMAC verify
- **`src/lib/cancellation-token.ts`** (nuevo) — JWT
- **`src/lib/ics.ts`** (nuevo) — VCALENDAR builder
- **`src/lib/reservation-pricing.ts`** (nuevo) — re-usa `pricing.ts`
- **`src/db/queries/reservations.ts`** (nuevo) — createPending + transitionToConfirmed (tx)
- **`src/db/queries/payments.ts`** (nuevo) — insertOrIgnore
- **`src/app/api/reservations/route.ts`** (nuevo) — POST
- **`src/app/api/webhooks/mercadopago/route.ts`** (nuevo) — POST con HMAC + tx
- **`src/app/api/cron/expire-reservations/route.ts`** (nuevo) — GET con bearer auth
- **`src/app/r/[id]/{success,failure,pending}/page.tsx`** (nuevo) — return pages
- **`src/components/agenda/ReservationSheet.tsx`** (nuevo) — bottom sheet
- **`src/components/agenda/AgendaView.tsx`** — modificar onSelect del SlotCard
- **`src/app/page.tsx`** — sin cambios (AgendaView se encarga)
- **`vercel.json`** (nuevo) — cron config
