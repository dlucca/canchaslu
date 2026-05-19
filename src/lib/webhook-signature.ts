import crypto from 'node:crypto';

const MAX_AGE_SEC = 300; // 5 minutes

/**
 * Verifies the MercadoPago webhook x-signature header.
 * Format: `ts=<unix>,v1=<hex hmac>`.
 * Manifest: `id:<paymentId>;request-id:<x-request-id>;ts:<ts>;`
 */
export function verifyMpSignature(opts: {
  paymentId: string;
  headers: Record<string, string | undefined>;
  secret: string;
  /** Override for tests; defaults to current time in seconds */
  nowSec?: number;
}): boolean {
  const { paymentId, headers, secret } = opts;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);

  const sigHeader = headers['x-signature'];
  const requestId = headers['x-request-id'];
  if (!sigHeader || !requestId) return false;

  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k?.trim(), v?.trim()];
    }),
  ) as Record<string, string | undefined>;

  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const tsNum = Number.parseInt(ts, 10);
  if (Number.isNaN(tsNum)) return false;
  if (Math.abs(nowSec - tsNum) > MAX_AGE_SEC) return false;

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return timingSafeHexEqual(expected, v1);
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
