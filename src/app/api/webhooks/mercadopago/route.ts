import { NextResponse, type NextRequest } from 'next/server';

import { paymentExistsByProviderEventId } from '@/db/queries/payments';
import { transitionReservationToConfirmed } from '@/db/queries/reservations';

import { env } from '@/lib/env';
import { createMercadoPagoClient } from '@/lib/mercadopago';
import { verifyMpSignature } from '@/lib/webhook-signature';

export const dynamic = 'force-dynamic';

function headersToRecord(req: NextRequest): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  req.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function mpStatusToRowStatus(
  status: string,
): 'pending' | 'approved' | 'rejected' | 'refunded' | 'cancelled' {
  switch (status) {
    case 'approved':
    case 'authorized':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const headers = headersToRecord(req);

    // MP can deliver payment_id in body.data.id, top-level data.id, or ?data.id=
    const bodyText = await req.text();
    let body: { data?: { id?: string | number }; type?: string; action?: string } = {};
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as typeof body;
      } catch {
        body = {};
      }
    }
    const paymentId =
      (body?.data?.id != null ? String(body.data.id) : null) ?? url.searchParams.get('data.id');

    if (!paymentId) {
      console.error(JSON.stringify({ level: 'warn', route: 'webhook/mp', reason: 'no_payment_id' }));
      return new NextResponse('missing payment id', { status: 400 });
    }

    if (!verifyMpSignature({ paymentId, headers, secret: env.MP_WEBHOOK_SECRET })) {
      console.error(
        JSON.stringify({ level: 'warn', route: 'webhook/mp', reason: 'bad_signature', paymentId }),
      );
      return new NextResponse('unauthorized', { status: 401 });
    }

    // Idempotency: if we already processed this payment id, ack and exit.
    if (await paymentExistsByProviderEventId(paymentId)) {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    // Re-fetch the payment from MP API — don't trust the webhook payload.
    const mp = createMercadoPagoClient(env.MP_ACCESS_TOKEN);
    const payment = await mp.getPayment(paymentId);

    const reservationId = payment.external_reference;
    if (!reservationId) {
      console.error(
        JSON.stringify({
          level: 'warn',
          route: 'webhook/mp',
          reason: 'no_external_reference',
          paymentId,
        }),
      );
      // ACK so MP stops retrying; we can't link it anyway.
      return NextResponse.json({ ok: true });
    }

    const rowStatus = mpStatusToRowStatus(payment.status);

    const outcome = await transitionReservationToConfirmed({
      reservationId,
      payment: {
        provider: 'mercadopago',
        providerPaymentId: paymentId,
        providerEventId: paymentId,
        amountCents: Math.round(payment.transaction_amount * 100),
        currency: payment.currency_id,
        status: rowStatus,
        rawPayload: payment.raw,
        webhookReceivedAt: new Date(),
        capturedAt: rowStatus === 'approved' ? new Date() : null,
      },
    });

    console.log(
      JSON.stringify({
        level: 'info',
        route: 'webhook/mp',
        paymentId,
        reservationId,
        outcome,
        mpStatus: payment.status,
      }),
    );

    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', route: 'webhook/mp', err: String(err) }));
    return new NextResponse('internal error', { status: 500 });
  }
}
