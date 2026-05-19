import crypto from 'node:crypto';

export type CancellationTokenPayload = {
  reservationId: string;
  /** ISO UTC timestamp at which the token expires (typically reservation start) */
  expiresAtUtc: string;
};

const HEADER = base64UrlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

export function signCancellationToken(payload: CancellationTokenPayload, secret: string): string {
  const claims = {
    rid: payload.reservationId,
    exp: Math.floor(new Date(payload.expiresAtUtc).getTime() / 1000),
  };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(claims)));
  const data = `${HEADER}.${body}`;
  const sig = base64UrlEncode(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyCancellationToken(
  token: string,
  secret: string,
): CancellationTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts as [string, string, string];

  const expected = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest(),
  );
  if (!timingSafeEqualStr(expected, sigB64)) return null;

  let claims: { rid?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(bodyB64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof claims.rid !== 'string' || typeof claims.exp !== 'number') return null;
  if (claims.exp * 1000 < Date.now()) return null;
  return {
    reservationId: claims.rid,
    expiresAtUtc: new Date(claims.exp * 1000).toISOString(),
  };
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
