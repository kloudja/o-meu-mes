export function localAccess(headers: Pick<Headers, 'get'>) {
  const host = headers.get('host');
  return host !== null && /^(127\.0\.0\.1|localhost):\d+$/.test(host);
}

export function writeAccess(request: Request) {
  return localAccess(request.headers) && request.headers.get('origin') === `http://${request.headers.get('host')}`;
}
