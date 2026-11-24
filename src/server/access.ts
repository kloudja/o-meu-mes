export function localAccess(headers: Pick<Headers, 'get'>) {
  const host = headers.get('host');
  return host !== null && /^(127\.0\.0\.1|localhost):\d+$/.test(host);
}

export function applicationAccess(headers: Pick<Headers, 'get'>, configuredOrigin = process.env.OMEUMES_AUTH_ORIGIN) {
  if (!configuredOrigin) return localAccess(headers);
  try {
    const origin = new URL(configuredOrigin);
    const allowedProtocol = origin.protocol === 'https:' ||
      (origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname));
    return allowedProtocol && origin.origin === configuredOrigin && headers.get('host') === origin.host;
  } catch {
    return false;
  }
}

export function writeAccess(request: Request) {
  return localAccess(request.headers) && request.headers.get('origin') === `http://${request.headers.get('host')}`;
}
