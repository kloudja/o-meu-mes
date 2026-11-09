import type { NextRequest } from 'next/server';

export const config = { matcher: '/demo/:path*' };

export function proxy(request: NextRequest) {
  if (process.env.OMEUMES_TEST_MODE === '1' && process.env.OMEUMES_E2E_ISOLATED === '1') return;
  if (process.env.OMEUMES_TRIAL === '1' && process.env.OMEUMES_LOCAL_TRIAL_DEMO === '1' &&
    /^(127\.0\.0\.1|localhost):\d+$/.test(request.headers.get('host')??'') && !request.headers.has('x-omeumes-entry')) return;
  return new Response('A demonstração foi retirada. Para testar, abra Ensaio.cmd no PC.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
