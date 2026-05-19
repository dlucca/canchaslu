import { describe, expect, it } from 'vitest';

import {
  signCancellationToken,
  verifyCancellationToken,
  type CancellationTokenPayload,
} from '@/lib/cancellation-token';

const SECRET = 'a'.repeat(64); // 32-byte hex equivalent

describe('cancellation-token', () => {
  it('signs and verifies a token roundtrip', () => {
    const payload: CancellationTokenPayload = {
      reservationId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAtUtc: '2026-06-15T13:00:00.000Z',
    };
    const token = signCancellationToken(payload, SECRET);
    const verified = verifyCancellationToken(token, SECRET);
    expect(verified).toEqual({
      reservationId: payload.reservationId,
      expiresAtUtc: payload.expiresAtUtc,
    });
  });

  it('returns null when the signature is tampered', () => {
    const payload: CancellationTokenPayload = {
      reservationId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAtUtc: '2026-06-15T13:00:00.000Z',
    };
    const token = signCancellationToken(payload, SECRET);
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(verifyCancellationToken(tampered, SECRET)).toBeNull();
  });

  it('returns null when verified with a different secret', () => {
    const payload: CancellationTokenPayload = {
      reservationId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAtUtc: '2026-06-15T13:00:00.000Z',
    };
    const token = signCancellationToken(payload, SECRET);
    expect(verifyCancellationToken(token, 'b'.repeat(64))).toBeNull();
  });

  it('returns null when the token has expired', () => {
    const payload: CancellationTokenPayload = {
      reservationId: '550e8400-e29b-41d4-a716-446655440000',
      expiresAtUtc: '2020-01-01T00:00:00.000Z', // far past
    };
    const token = signCancellationToken(payload, SECRET);
    expect(verifyCancellationToken(token, SECRET)).toBeNull();
  });

  it('returns null on malformed input', () => {
    expect(verifyCancellationToken('not-a-jwt', SECRET)).toBeNull();
    expect(verifyCancellationToken('', SECRET)).toBeNull();
  });
});
