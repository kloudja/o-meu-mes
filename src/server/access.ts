import { timingSafeEqual } from 'node:crypto';

export function accessMode(headers: Pick<Headers, 'get'>) {
  const host = headers.get('host');
  const proof = headers.get('x-omeumes-entry');
  if (proof === null && host && /^(127\.0\.0\.1|localhost):\d+$/.test(host)) return 'local';
  const origin = process.env.OMEUMES_HOME_ORIGIN;
  const secret = process.env.OMEUMES_HOME_ENTRY;
  if (!origin || !secret || host !== new URL(origin).host || !proof || proof.length !== secret.length) return null;
  const supplied = Buffer.from(proof);
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? 'home' : null;
}

export function writeAccess(request: Request) {
  const mode = accessMode(request.headers);
  const expected = mode === 'home' ? process.env.OMEUMES_HOME_ORIGIN
    : mode === 'local' ? `http://${request.headers.get('host')}` : null;
  return expected && request.headers.get('origin') === expected ? mode : null;
}
