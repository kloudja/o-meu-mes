export async function sharingRequest<T>(
  account: string,
  space: string | null,
  input?: Record<string, unknown>,
) {
  const route = input?.action === 'proposeTransfer' ? '/api/identity' : '/api/sharing';
  const res = await fetch(
    route + (space && route === '/api/sharing' ? '?spaceId=' + encodeURIComponent(space) : ''),
    {
      method: input ? 'POST' : 'GET',
      cache: 'no-store',
      headers: { 'X-Account': account, ...(input ? { 'Content-Type': 'application/json' } : {}) },
      body: input ? JSON.stringify(input) : undefined,
      signal: AbortSignal.timeout(15000),
    },
  );
  const payload = await res.json();
  if (!res.ok) {
    if (res.status === 403 && payload.code === 'SPACE_ACCESS')
      window.dispatchEvent(new CustomEvent('omeumes.spaceAccess', { detail: { space, code: payload.code } }));
    const error = new Error(payload.message) as Error & { fields?: Record<string, string> };
    error.fields = payload.fields;
    throw error;
  }
  return payload as T;
}
