import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyMpSignature } from '@/lib/webhook-signature';

const SECRET = 'mp_webhook_secret_test';

function buildSignedHeaders(opts: {
  paymentId: string;
  requestId: string;
  ts: number;
  secret?: string;
}): Record<string, string> {
  const secret = opts.secret ?? SECRET;
  const manifest = `id:${opts.paymentId};request-id:${opts.requestId};ts:${opts.ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return {
    'x-signature': `ts=${opts.ts},v1=${hmac}`,
    'x-request-id': opts.requestId,
  };
}

describe('verifyMpSignature', () => {
  const nowSec = Math.floor(Date.now() / 1000);

  it('accepts a valid signature within the freshness window', () => {
    const headers = buildSignedHeaders({ paymentId: '999', requestId: 'req-1', ts: nowSec });
    expect(verifyMpSignature({ paymentId: '999', headers, secret: SECRET, nowSec })).toBe(true);
  });

  it('rejects when the signature does not match', () => {
    const headers = buildSignedHeaders({ paymentId: '999', requestId: 'req-1', ts: nowSec });
    headers['x-signature'] = headers['x-signature']!.replace(/v1=.*/, 'v1=deadbeef');
    expect(verifyMpSignature({ paymentId: '999', headers, secret: SECRET, nowSec })).toBe(false);
  });

  it('rejects when the secret is wrong', () => {
    const headers = buildSignedHeaders({ paymentId: '999', requestId: 'req-1', ts: nowSec });
    expect(verifyMpSignature({ paymentId: '999', headers, secret: 'wrong', nowSec })).toBe(false);
  });

  it('rejects when ts is older than 5 minutes', () => {
    const oldTs = nowSec - 600;
    const headers = buildSignedHeaders({ paymentId: '999', requestId: 'req-1', ts: oldTs });
    expect(verifyMpSignature({ paymentId: '999', headers, secret: SECRET, nowSec })).toBe(false);
  });

  it('rejects when x-signature header is missing or malformed', () => {
    expect(
      verifyMpSignature({ paymentId: '999', headers: { 'x-request-id': 'req-1' }, secret: SECRET, nowSec }),
    ).toBe(false);
    expect(
      verifyMpSignature({
        paymentId: '999',
        headers: { 'x-signature': 'malformed', 'x-request-id': 'req-1' },
        secret: SECRET,
        nowSec,
      }),
    ).toBe(false);
  });
});
