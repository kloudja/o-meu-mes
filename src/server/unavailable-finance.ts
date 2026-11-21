export function unavailableFinance() {
  return Response.json(
    { message: 'O acesso financeiro aguarda a atribuição de um espaço.' },
    {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
