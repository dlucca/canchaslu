const MP_BASE = 'https://api.mercadopago.com';

export type CreatePreferenceInput = {
  reservationId: string;
  description: string;
  unitPriceCents: number;
  currency: string;
  payerEmail?: string;
  expiresAtUtc: Date;
  backUrlBase: string; // e.g. https://canchaslu.vercel.app
  notificationUrl: string; // full URL of the webhook handler
};

export type CreatePreferenceResult = {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
};

export type GetPaymentResult = {
  id: string;
  status:
    | 'pending'
    | 'approved'
    | 'authorized'
    | 'in_process'
    | 'in_mediation'
    | 'rejected'
    | 'cancelled'
    | 'refunded'
    | 'charged_back';
  external_reference: string;
  transaction_amount: number; // in major units (ARS)
  currency_id: string;
  raw: Record<string, unknown>;
};

/**
 * Thin wrapper over the MercadoPago REST API. Injectable for testing.
 */
export interface MercadoPagoClient {
  createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult>;
  getPayment(paymentId: string): Promise<GetPaymentResult>;
}

export function createMercadoPagoClient(accessToken: string): MercadoPagoClient {
  return {
    async createPreference(input) {
      const body = {
        external_reference: input.reservationId,
        items: [
          {
            id: input.reservationId,
            title: input.description,
            quantity: 1,
            unit_price: input.unitPriceCents / 100,
            currency_id: input.currency,
          },
        ],
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        back_urls: {
          success: `${input.backUrlBase}/r/${input.reservationId}/success`,
          failure: `${input.backUrlBase}/r/${input.reservationId}/failure`,
          pending: `${input.backUrlBase}/r/${input.reservationId}/pending`,
        },
        auto_return: 'approved',
        notification_url: input.notificationUrl,
        expires: true,
        expiration_date_to: input.expiresAtUtc.toISOString(),
      };

      const res = await fetch(`${MP_BASE}/checkout/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MP createPreference failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as {
        id: string;
        init_point: string;
        sandbox_init_point: string;
      };
      return {
        id: data.id,
        initPoint: data.init_point,
        sandboxInitPoint: data.sandbox_init_point,
      };
    },

    async getPayment(paymentId) {
      const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MP getPayment failed: ${res.status} ${text}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      return {
        id: String(data.id),
        status: data.status as GetPaymentResult['status'],
        external_reference: String(data.external_reference ?? ''),
        transaction_amount: Number(data.transaction_amount ?? 0),
        currency_id: String(data.currency_id ?? 'ARS'),
        raw: data,
      };
    },
  };
}
