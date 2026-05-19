# PRD — Webapp Mobile-First de Reservas para Canchas de Fútbol (v3)

> Versión final pre-build con todas las decisiones cerradas. Cambios respecto de v2 al final del documento.

---

## 1. Visión General

Webapp mobile-first para reservar canchas de fútbol por hora con disponibilidad en tiempo real, pago de seña online y confirmación automática. El complejo tiene 2 canchas. El objetivo operativo es eliminar la coordinación manual por WhatsApp y Excel, y maximizar ocupación reduciendo no-shows mediante seña obligatoria.

La experiencia prioriza velocidad, simplicidad y conversión desde mobile. La reserva debe completarse en menos de 60 segundos desde landing hasta confirmación de pago.

---

## 2. Objetivos y KPIs

### Objetivos

- Reserva end-to-end en menos de 60 segundos desde mobile.
- Reducir reservas manuales por WhatsApp en al menos 70% en los primeros 3 meses.
- Reducir no-shows por debajo del 10% mediante seña obligatoria.
- Centralizar disponibilidad y administración en una sola fuente de verdad.

### KPIs iniciales

- Tiempo promedio de reserva < 60 segundos.
- Tasa de conversión visitante → reserva pagada > 15%.
- Reservas auto-gestionadas vs manuales > 70%.
- No-shows < 10%.
- Tráfico mobile > 80%.
- Tasa de webhook fallidos reconciliados manualmente < 1%.

---

## 3. Usuarios

### Usuario final (jugador)

Mobile-first, baja tolerancia a fricción, suele llegar desde Instagram o WhatsApp, prioriza ver disponibilidad inmediata sin login. No quiere crear cuenta para una reserva única.

### Administrador del complejo

Dueño o personal operativo. Necesita: ver agenda del día, crear/cancelar reservas manuales, confirmar pagos en efectivo, bloquear horarios por mantenimiento, configurar precios y horarios de operación.

### Operador (rol opcional en MVP)

Empleado del complejo con permisos limitados (ver reservas, crear manuales, marcar pagos en efectivo) pero sin acceso a configuración de precios ni canchas. Se modela desde día 1 aunque inicialmente exista un solo admin.

---

## 4. Alcance MVP

### Incluye

**Frontend usuario**

- Home mobile-first con CTA directo a disponibilidad.
- Selector de fecha y cancha (2 canchas fijas en MVP).
- Vista agenda de horarios disponibles en tiempo real.
- Formulario de reserva como guest (sin login).
- Pago de seña con MercadoPago Checkout Pro.
- Pantalla de confirmación con detalles y enlaces útiles (Maps, WhatsApp, calendario).
- Página pública para cancelar reserva con token único enviado por email.

**Backend**

- Gestión de disponibilidad con anti-solapamiento enforced a nivel base.
- Timeout automático de reservas no pagadas (cron).
- Máquina de estados de reserva y pago con transiciones explícitas.
- Webhook de MercadoPago con verificación de firma e idempotencia.
- Reconciliación periódica con API de MercadoPago para pagos no notificados por webhook.
- Audit log de cambios sensibles.

**Panel administrador**

- Auth con email + password (Supabase Auth).
- Dashboard del día.
- CRUD de canchas y horarios de operación.
- Gestión manual de reservas (crear, cancelar, reagendar, marcar pagada en efectivo, marcar no-show).
- Bloqueos manuales de horarios.
- Carga manual de feriados y excepciones de horario.
- Botón "Cancelar con refund" para casos de clima u otra fuerza mayor.
- Configuración de pricing con reglas de hora pico y día de la semana.

### Fuera de alcance MVP

- App nativa iOS/Android.
- Marketplace multi-complejo (el schema lo soporta, pero la UI es single-venue).
- Membresías, ranking, torneos, chat interno, equipos, reviews, wallet, créditos, gamificación.
- Reagendar self-service (queda solo "cancelar y volver a reservar").
- Login con cuenta persistente (V2).
- Integración WhatsApp Business API (V2).
- Dynamic pricing automático (V3).
- Registro del balance a pagar en complejo (el sistema solo gestiona la seña online; el pago presencial queda fuera del sistema).
- Integración con API de feriados (admin los carga manualmente).
- Integración con API de clima para cancelaciones automáticas.

---

## 5. Arquitectura General

### Frontend

- Next.js 15 (App Router) con TypeScript.
- TailwindCSS + shadcn/ui.
- React Server Components donde aplique; cliente solo para interacción.

### Backend

- Next.js Route Handlers (`/api`) para endpoints de reserva, pago y webhooks.
- Server Actions para mutaciones desde panel admin.
- Postgres (vía Supabase) como única fuente de verdad.
- Drizzle ORM para queries type-safe y migrations.

### Decisión Supabase + Drizzle

Se usa Supabase para:

- Postgres hosteado.
- Supabase Auth (panel admin).
- Storage (fotos de canchas).

No se usa de Supabase: auto-generated REST/GraphQL APIs ni Row Level Security como mecanismo principal de autorización. La autorización se enforza en el backend (Route Handlers + Server Actions) con Drizzle. Esta decisión asume que todo acceso a datos pasa por el backend propio y nunca desde el cliente con un anon key.

### Infraestructura

- Vercel (frontend + Route Handlers).
- Supabase (Postgres + Auth + Storage).
- Cron jobs: Vercel Cron para expiración de reservas y reconciliación de pagos.

### Servicios externos

- MercadoPago Checkout Pro (pagos + webhooks).
- Resend (emails transaccionales).
- Sentry (error monitoring) — recomendado desde día 1.

### Timezone

Toda fecha/hora se persiste en UTC (`timestamptz`). La UI renderiza en `America/Argentina/Buenos_Aires` por defecto. El timezone del complejo es configurable a nivel `venues` para soportar expansión futura.

---

## 6. Mobile-First UX

### Principios

- Operación con una mano: zonas activas en mitad inferior de pantalla.
- Inputs mínimos: nombre, WhatsApp, email opcional.
- Sin login obligatorio para reservar.
- Cero modales bloqueantes; usar bottom sheets cuando sea necesario.
- Tiempo de respuesta visible < 300ms en interacciones clave.

### Flujo ideal en 4 pasos

1. Elegir fecha y cancha.
2. Elegir horario disponible.
3. Pagar seña.
4. Confirmación.

---

## 7. Flujo Usuario

### Paso 1 — Home

Hero con CTA "Ver horarios". Selector rápido de fecha (default: hoy) y cancha. Como hay 2 canchas en MVP, el selector muestra ambas explícitamente con nombre y tipo.

### Paso 2 — Disponibilidad

Vista agenda vertical con slots horarios. Cada slot muestra hora, cancha, precio y estado. Estados visibles: **Disponible**, **No disponible** (engloba reservado, pendiente de pago y bloqueado para no revelar info operativa al público).

Refresh automático cada 30s o al volver a la pestaña visible (`visibilitychange`).

### Paso 3 — Reserva

Formulario:

- Nombre (requerido).
- WhatsApp (requerido, formato internacional E.164).
- Email (opcional pero recomendado para envío de comprobante y link de cancelación).

Resumen visible permanente: cancha, fecha, hora, duración, precio total, monto de seña, balance a pagar en el complejo (informativo, no se registra en el sistema).

CTA: "Reservar y pagar seña".

Al confirmar:

1. Se crea reserva con `status = pending`, `payment_status = unpaid`.
2. Se genera `expires_at = now() + 15 minutes`.
3. Se redirige a Checkout Pro de MercadoPago.

### Paso 4 — Pago

MercadoPago Checkout Pro. La seña es 30% del total (configurable por venue).

### Paso 5 — Confirmación

Pantalla final con:

- Datos de la reserva.
- Dirección con botón "Abrir en Google Maps".
- Botón "Compartir por WhatsApp" (deeplink `wa.me`).
- Botón "Agregar al calendario" (archivo `.ics`).
- Link único de cancelación (token firmado con expiración al inicio de la reserva).

### Página de cancelación

Acceso vía link único enviado por email. Muestra datos de la reserva y un único CTA: "Cancelar reserva". Aplica la política de cancelación de sección 11 según el momento. Si el usuario quiere otro horario, debe volver al home y reservar de nuevo.

---

## 8. Panel Administrador

### Auth

Supabase Auth con email + password. Roles: `admin` (acceso total) y `operator` (sin acceso a configuración de pricing ni canchas). Sesión persistente con cookie HTTPOnly.

### Dashboard

- Reservas confirmadas del día con timeline visual.
- Pagos pendientes con tiempo restante hasta expiración.
- Slots libres del día con conteo de revenue potencial.
- Indicador de webhooks fallidos pendientes de reconciliación.

### Gestión de reservas

Acciones:

- Crear reserva manual (puede saltar el flujo de pago online y crearse directamente con `payment_status = paid_deposit` y `payment_method = cash`).
- Cancelar.
- Cancelar con refund (botón separado para clima u otra fuerza mayor; aplica refund 100% independientemente del momento).
- Reagendar.
- Marcar no-show.
- Exportar a CSV.

### Gestión de canchas

CRUD con: nombre, tipo (enum: `f5`, `f7`, `f11`, `futsal`), superficie (enum: `sintetico`, `cemento`, `cesped`), techada (bool), duración estándar de turno (minutos), precio base por hora, fotos, estado activo/inactivo. Seed inicial con 2 canchas.

### Gestión de horarios de operación

Por cancha y por día de semana: hora de apertura, hora de cierre, granularidad del turno (default 60 min).

### Excepciones y feriados

Carga manual desde el panel. Por cancha y fecha: cierre total o cambio de horario. El admin gestiona el calendario de feriados según su criterio operativo (no hay integración con API externa).

### Bloqueos

Crear bloqueos con rango, motivo y visibilidad opcional al público. Útil para mantenimiento, eventos privados, lluvia.

### Pricing rules

UI para definir reglas: precio base por cancha + multiplicadores por hora pico y por día de semana. Ver sección 12.

### Audit log

Vista de últimos cambios sobre reservas: quién hizo qué y cuándo.

---

## 9. Modelo de Datos

Todas las tablas tienen `id` (uuid), `created_at` (timestamptz default now), `updated_at` (timestamptz, auto-update vía trigger). Montos monetarios siempre como `integer` en centavos. Toda fecha/hora como `timestamptz`.

### `venues`

```
id              uuid PK
name            text
address         text
timezone        text default 'America/Argentina/Buenos_Aires'
currency        text default 'ARS'
deposit_pct     integer default 30
created_at      timestamptz
updated_at      timestamptz
```

### `courts`

```
id                uuid PK
venue_id          uuid FK -> venues
name              text
type              enum('f5','f7','f11','futsal')
surface           enum('sintetico','cemento','cesped')
covered           boolean default false
slot_duration_min integer default 60
base_price_cents  integer
active            boolean default true
photos            jsonb default '[]'
created_at        timestamptz
updated_at        timestamptz
```

### `court_schedules`

Horarios de operación por cancha y día de semana.

```
id              uuid PK
court_id        uuid FK -> courts
day_of_week     integer (0=domingo, 6=sábado)
opens_at        time
closes_at       time
active          boolean default true
```

### `schedule_exceptions`

Excepciones puntuales por fecha cargadas manualmente por admin (feriados, eventos, mantenimientos planificados).

```
id              uuid PK
court_id        uuid FK -> courts
date            date
opens_at        time nullable
closes_at       time nullable
closed          boolean default false
reason          text
```

### `pricing_rules`

Multiplicadores sobre el `base_price_cents` de la cancha.

```
id              uuid PK
court_id        uuid FK -> courts
day_of_week     integer nullable
start_time      time nullable
end_time        time nullable
multiplier      numeric(4,2)
priority        integer default 0
active          boolean default true
```

### `reservations`

```
id                  uuid PK
court_id            uuid FK -> courts
user_name           text
user_phone          text
user_email          text nullable
starts_at           timestamptz
ends_at             timestamptz
time_range          tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED
status              enum('pending','confirmed','cancelled','completed','no_show')
payment_status      enum('unpaid','paid_deposit','refunded')
payment_method      enum('mercadopago','cash') nullable
total_cents         integer
deposit_cents       integer
currency            text default 'ARS'
expires_at          timestamptz nullable
cancellation_token  text unique
created_by          enum('guest','admin','operator')
admin_user_id       uuid FK -> admin_users nullable
notes               text nullable
cancelled_at        timestamptz nullable
cancellation_reason enum('user','admin','admin_force_majeure','timeout') nullable
created_at          timestamptz
updated_at          timestamptz
```

**Constraint clave anti-doble-reserva:**

```sql
ALTER TABLE reservations
ADD CONSTRAINT no_overlap_active_reservations
EXCLUDE USING gist (
  court_id WITH =,
  time_range WITH &&
) WHERE (status IN ('pending', 'confirmed'));
```

Requiere extensión `btree_gist`.

### `blocked_slots`

```
id              uuid PK
court_id        uuid FK -> courts
starts_at       timestamptz
ends_at         timestamptz
time_range      tstzrange GENERATED
reason          text
public_visible  boolean default false
created_by      uuid FK -> admin_users
created_at      timestamptz
```

Trigger adicional verifica que un bloqueo no se solape con reservas activas y viceversa.

### `payments`

```
id                    uuid PK
reservation_id        uuid FK -> reservations
provider              enum('mercadopago','cash')
provider_payment_id   text nullable
provider_event_id     text nullable unique
amount_cents          integer
currency              text default 'ARS'
status                enum('pending','approved','rejected','refunded','cancelled')
raw_payload           jsonb nullable
webhook_received_at   timestamptz nullable
captured_at           timestamptz nullable
created_at            timestamptz
updated_at            timestamptz
```

### `admin_users`

```
id              uuid PK
email           text unique
role            enum('admin','operator')
active          boolean default true
created_at      timestamptz
updated_at      timestamptz
```

### `audit_log`

```
id              uuid PK
entity_type     text
entity_id       uuid
action          text
actor_type      enum('system','admin','operator','guest','webhook')
actor_id        uuid nullable
diff            jsonb
created_at      timestamptz
```

---

## 10. Máquina de Estados

### Reservation status

```
pending ──pago aprobado──> confirmed
pending ──timeout (15min)──> cancelled
pending ──admin cancela────> cancelled
confirmed ──user cancela───> cancelled (refund según política)
confirmed ──admin cancela──> cancelled (refund 100%)
confirmed ──admin "fuerza mayor"──> cancelled (refund 100%)
confirmed ──pasa la hora───> completed
confirmed ──no aparece────> no_show
```

### Payment status

```
unpaid ──pago seña ok───> paid_deposit
paid_deposit ──refund procesado──> refunded
```

### Matriz de combinaciones válidas

| reservation \ payment | unpaid | paid_deposit | refunded |
|---|---|---|---|
| pending     | ✓ inicial | ✗ | ✗ |
| confirmed   | ✗ | ✓ | ✗ |
| cancelled   | ✓ (timeout) | ✗ | ✓ |
| completed   | ✗ | ✓ | ✗ |
| no_show     | ✗ | ✓ | ✗ |

Cualquier transición fuera de esta matriz es rechazada a nivel aplicación y loggeada como error.

---

## 11. Reglas de Negocio

### Anticipación de reserva

- Mínima: 30 minutos antes del slot.
- Máxima: 30 días desde hoy.

Ambos límites configurables por venue.

### Timeout de reservas pendientes

15 minutos desde la creación. Vencido el plazo, un cron de Vercel cada minuto marca la reserva como `cancelled` con `cancellation_reason = 'timeout'` y libera el slot.

### Política de cancelación

- Usuario con más de 24h de anticipación: refund 100% de la seña (`cancellation_reason = 'user'`).
- Usuario con menos de 24h: cancela pero sin refund (`cancellation_reason = 'user'`).
- Admin: refund 100% siempre (`cancellation_reason = 'admin'`).
- Admin por fuerza mayor (lluvia, corte de luz, evento privado del complejo): refund 100%, botón separado en panel (`cancellation_reason = 'admin_force_majeure'`). El criterio queda a discreción del admin (no hay automatización ni umbrales).

### No-shows

El admin marca `status = no_show` después del horario reservado. La seña no se reembolsa. Sin consecuencias automáticas en MVP.

### Seña y pago en complejo

- Seña default 30% del total, configurable por venue.
- El balance se cobra en el complejo de forma manual y queda fuera del sistema. La UI lo muestra como informativo en el resumen previo al pago.
- Reserva pasa a `confirmed` solo cuando MP devuelve pago aprobado y el webhook fue procesado exitosamente.

### Disponibilidad

Garantizada por:

1. Exclusion constraint en Postgres sobre `(court_id, time_range)` donde `status IN ('pending','confirmed')`.
2. La creación de una reserva pending bloquea el slot por 15 minutos aunque no esté pagada.
3. Bloqueos manuales se chequean vía trigger contra reservas activas.

---

## 12. Pricing

### Modelo

`precio_final = base_price_cents × multiplier_aplicable`

El multiplier surge de `pricing_rules`. Si varias reglas matchean un slot, gana la de mayor `priority`. Si no matchea ninguna, se usa el `base_price_cents` puro (multiplier = 1.0).

### Ejemplos típicos

- Lunes a viernes 19:00–23:00: multiplier 1.5 (hora pico).
- Sábado y domingo todo el día: multiplier 1.3.
- Resto: multiplier 1.0.

### Pricing en MVP vs V2

MVP: reglas estáticas por hora y día de semana, configurables por admin. Sin promociones ni cupones.

V2: cupones de descuento, paquetes (5 horas con descuento), pricing dinámico por ocupación.

---

## 13. Integraciones

### MercadoPago Checkout Pro

**Creación de preferencia**

Al crear reserva pending, el backend crea una preferencia de MP con:

- `external_reference = reservation.id`.
- `back_urls` apuntando a páginas de éxito/falla.
- `notification_url` apuntando al webhook propio.
- `expires = true` con `expiration_date_to = reservation.expires_at`.

**Webhook**

Endpoint: `POST /api/webhooks/mercadopago`.

Pasos del handler:

1. Verificar firma HMAC con secret de MP.
2. Extraer `id` del evento.
3. Verificar idempotencia: si `provider_event_id` ya existe en `payments`, devolver 200 y no procesar.
4. Llamar a la API de MP con el `payment_id` para obtener el estado real (no confiar en el payload).
5. Buscar la reserva por `external_reference`.
6. Validar transición de estado contra la matriz.
7. Aplicar cambio dentro de una transacción: update reservation + insert/update payment + insert audit_log.
8. Disparar email de confirmación vía Resend.

**Reconciliación**

Cron cada 5 minutos:

- Busca reservations en `pending` con `created_at > now() - 1h` que tengan preference asociada.
- Llama a la API de MP para chequear el estado.
- Si MP dice aprobado y la reserva sigue pending → procesa como si fuera webhook (mismo path idempotente).

**Refund automático**

Cuando se cancela una reserva con derecho a refund, se llama a la API de MP para procesar el reembolso. Si falla, se registra en `audit_log` con flag para retry manual desde panel.

**Casos edge documentados**

- Pago aprobado por MP después del timeout y slot tomado por otro: el handler detecta que el slot ya no está disponible, marca el pago como `rejected_late`, y dispara refund automático vía API de MP. Email al usuario explicando.
- Webhook duplicado: idempotency key bloquea reproceso.
- Webhook con firma inválida: 401 y log a Sentry.

### Resend

Emails transaccionales (ver sección 14).

### WhatsApp

MVP: link `wa.me` con mensaje pre-armado para que el usuario contacte al complejo si lo necesita. No hay envío automático.

V2: integración con WhatsApp Business API para confirmaciones y recordatorios.

---

## 14. Notificaciones

### Triggers

| Evento | Canal | Timing |
|---|---|---|
| Reserva confirmada | Email | Inmediato post-pago |
| Recordatorio | Email | 24h antes y 2h antes |
| Cancelación | Email | Inmediato |
| Refund procesado | Email | Inmediato |

### Anti-spam

Máximo 1 email por evento por reserva. Idempotencia por `(reservation_id, event_type)`.

---

## 15. Performance

- Lighthouse Mobile > 90 en home y agenda.
- LCP < 2s en 4G.
- TTI < 3s en 4G.
- Bundle inicial < 200KB gzipped.
- Vista de agenda: SSR de la primera fecha, fetch incremental al cambiar día.

---

## 16. Seguridad

- Rate limiting en endpoints críticos: 10 req/min por IP en creación de reservas, 100 req/min en lectura de disponibilidad.
- Validación server-side de todos los inputs con Zod.
- Webhook signature verification (HMAC) obligatoria.
- Cookies HTTPOnly + SameSite=Lax para sesiones admin.
- CSRF protection en mutaciones del panel.
- Sanitización de inputs de texto libre (notas, motivos).
- Logs sin PII completa (teléfono y email hasheados en logs de Sentry).
- Token de cancelación firmado con JWT, expira al inicio de la reserva.
- Secrets en variables de entorno, nunca en repo.

---

## 17. Observabilidad y Auditoría

- Sentry para errors y traces.
- Logs estructurados (JSON) en todas las Route Handlers.
- Audit log en base para acciones sensibles: cambios de estado de reserva, refunds, bloqueos, cambios de pricing.
- Dashboard interno (SQL simple en Supabase) con métricas operativas: reservas/día, conversión, no-shows, webhooks fallidos.

---

## 18. Roadmap

### MVP

Todo lo descripto arriba.

### V2

- Login persistente para usuarios (Supabase Auth con OTP por email/SMS).
- Historial de reservas y favoritos.
- Reagendar self-service sin pedir admin.
- Cupones de descuento.
- WhatsApp Business API.
- Recordatorios por WhatsApp.

### V3

- Multi-complejo / multi-tenant real.
- Membresías y paquetes.
- App nativa.
- Ranking, torneos, equipos.
- Dynamic pricing por ocupación.
- IA para forecasting de ocupación.

---

## 19. Riesgos

### Doble reserva por race condition

**Mitigación**: exclusion constraint en Postgres. Es la primera línea de defensa y no depende de lógica de aplicación.

### Webhook duplicado o no-llegado

**Mitigación**: idempotency key + reconciliación cron contra API de MP. Cubre ambos casos.

### Chargeback en MercadoPago

**Mitigación**: guardar `raw_payload` completo de cada pago, logs de quién creó la reserva, IP y user-agent. Política clara visible en checkout: reserva pagada = aceptación de términos.

### Caída de MercadoPago

**Mitigación**: si MP no responde en 10s al crear preferencia, mostrar error claro al usuario y sugerir reintentar o contactar por WhatsApp. No permitir bypass del pago online en MVP. Admin puede crear la reserva manualmente si el usuario llama.

### Cancha al aire libre con lluvia

**Mitigación**: política de cancelación por fuerza mayor en sección 11. UI del admin tiene botón "Cancelar con refund" que aplica refund 100% a criterio del admin.

### Pago aprobado tarde + slot tomado

**Mitigación**: refund automático vía API de MP, email al usuario, log en audit.

### No-shows altos

**Mitigación**: seña 30% en MVP. Si la métrica no baja del 10%, subir seña al 50% o pedir el total.

### Refund automático que falla

**Mitigación**: log en audit_log con flag de retry. Panel admin muestra refunds pendientes con botón de reintento manual.

### Sobre-ingeniería temprana

**Mitigación**: el alcance V2/V3 está explícito y fuera del MVP. Cada feature nueva pasa por review contra los KPIs.

---

## 20. Decisiones Tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Supabase + Drizzle (sin RLS principal) | Supabase con RLS / Postgres puro | Combina hosting + auth + storage de Supabase con type-safety de Drizzle. RLS sin auto-APIs no aporta. |
| Postgres exclusion constraint para anti-overlap | Lock pesimista en app | La base garantiza la invariante; la app no puede romperla por bug. |
| Seña fija 30% configurable por venue | Pago total / seña variable por cancha | Simple, refleja práctica común en complejos. |
| Reservas como guest | Login obligatorio | Reduce fricción mobile. Login viene en V2. |
| Webhook + reconciliación dual | Solo webhook | Webhook solo es frágil; reconciliación cubre fallas. |
| Money como integer cents | Decimal o float | Evita errores de precisión. |
| Timezone configurable por venue | Hardcodeado AR | Cuesta lo mismo y soporta expansión. |
| Pricing rules desde día 1 | Precio plano por cancha | Hora pico es real en fútbol. |
| Política de cancelación 24h | Sin cancelación / refund total | Balance razonable entre user y operador. |
| 2 canchas seedeadas en migración inicial | UI dinámica multi-cancha | Realidad del complejo. CRUD existe para agregar después. |
| Feriados cargados manualmente | Integración con API nacional | Volumen bajo, control total del admin. |
| Refund por clima a criterio del admin | Integración con API de clima | Criterio humano es mejor para casos borderline. |
| Balance presencial fuera del sistema | Registrar pagos parciales en sistema | Reduce superficie de bugs. El admin lo controla offline. |
| Cancelación sí, reagendar no (MVP) | Reagendar self-service | Mantiene UI pública en 1 acción. Reagendar entra en V2. |

---

## 21. TODO antes del deploy

- Definir branding (logo, paleta, nombre comercial).
- Crear cuenta admin inicial en Supabase Auth.
- Configurar credenciales productivas de MercadoPago.
- Configurar dominio en Vercel.
- Cargar las 2 canchas con datos reales (nombre, tipo, superficie, precio).
- Configurar horarios de operación.
- Cargar pricing rules de hora pico.

---

## 22. Próximos pasos antes del primer commit

1. Wireframes mobile de baja fidelidad de las 5 pantallas usuario + dashboard admin.
2. Backlog plano en Linear / GitHub Issues / Notion agrupado por épicas (setup, schema, API disponibilidad, flujo reserva, webhook MP, panel admin, emails).
3. Setup inicial: Supabase project, Vercel project, MP test credentials, Resend API key, Sentry project.
4. Migración inicial con Drizzle: tablas, enums, exclusion constraints, triggers, seed de 2 canchas.
5. Skeleton de Route Handlers con tests de contrato.

---

## Changelog v2 → v3

**Decisiones cerradas**

- 2 canchas: seed inicial fija, UI ajustada para selector explícito de cancha en home.
- Branding y admin email: diferidos a TODO antes del deploy.
- Feriados: carga manual por admin, sin integración externa.
- Refund por clima: criterio humano del admin, botón separado en panel.
- Balance en complejo: fuera del sistema.
- Reagendar self-service: removido del MVP.

**Cambios técnicos derivados**

- Enum `payment_status` simplificado: removido `paid_full` (ya no aplica porque el balance presencial está fuera del sistema). Queda: `unpaid`, `paid_deposit`, `refunded`.
- Matriz de estados actualizada (3 columnas en vez de 4).
- Tabla `reservations` ahora incluye `cancelled_at` y `cancellation_reason` (enum) para soportar la política diferenciada de refund y los reportes de audit.
- Acción `Reagendar` removida del panel admin y del flujo usuario.
- Endpoint de reagendar y email de "cambio de horario" removidos.
- Página pública de gestión simplificada: solo cancelar.
- Token de cancelación expira al inicio de la reserva (antes era al final).
- Panel admin gana botón "Cancelar con refund" para fuerza mayor.
- Sección 13 gana detalle de refund automático vía API de MP con retry manual si falla.
- Riesgo nuevo en sección 19: refund automático que falla.
