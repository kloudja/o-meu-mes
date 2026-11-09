// Cenário sintético exclusivo do ensaio. Todos os montantes estão em cêntimos.
export const trialPeriod = '2026-11';
export function trialActions(period = trialPeriod, review = false) {
  const [year, month] = period.split('-').map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  const expense = (id, name, plan, accountId, categoryId, extra = {}) =>
    ({ id, name, plan, accountId, categoryId, kind: 'expense', ...extra });
  const lines = [
    expense('trial-rent', 'Habitação', 8500, 'act-r', 'cat-habitacao'),
    expense('trial-services', 'Serviços Essenciais', 10000, 'act-r', 'cat-servicos'),
    expense('trial-food', 'Comida', 20000, 'act-r', 'cat-refeicoes', { variable: true }),
    expense('trial-insurance', 'Seguro do Carro', 15000, 'san', 'cat-seguros'),
    expense('trial-health', 'ADSE', 4000, 'moey-r', 'cat-saude', { reserveId: review ? 'trial-health-reserve' : 'trial-em' }),
    expense('trial-saving', 'Fundo Emergência', 10000, 'moey-r', 'cat-poupancas', { kind: 'saving', reserveId: 'trial-em' }),
  ];
  return [
    { type: 'month', period },
    { type: 'reserve', reserve: { id: 'trial-em', name: 'Fundo Emergência', accountId: 'moey-r' } },
    ...(review ? [{ type: 'reserve', reserve: { id: 'trial-health-reserve', name: 'Reserva ADSE', accountId: 'moey-r' } }] : []),
    ...lines.map(line => ({ type: 'line', line, target: 'base' })),
    { type: 'recurring', definition: { id: 'trial-google', name: 'Google One', date: `${period}-15`, frequency: 'monthly', active: true, amount: 199, accountId: 'act-r' } },
    ...(review ? [{ type: 'recurring', definition: { id: 'trial-insurance', name: 'Seguro do Carro', date: `${next}-20`, frequency: 'annual', active: true, amount: 15000, accountId: 'san' } }] : []),
    // O mês inicial pode já existir: colocar explicitamente o mesmo plano.
    ...lines.map(line => ({ type: 'line', line })),
    ...Object.entries({ 'a:act-r': 40000, 'a:act-s': 0, 'a:moey-r': 15000, 'a:moey-s': 0, 'a:san': 0, 'r:trial-em': 30000,
      ...(review ? { 'r:trial-health-reserve': 0 } : {}) })
      .map(([source, amount]) => ({ type: 'initial', source, amount })),
    { type: 'execute', lineId: 'trial-services', amount: 2000, date: `${period}-02`, source: 'a:act-r', complete: false, description: 'Registo fictício para experimentar correções' },
    { type: 'month', period: next },
  ];
}

export async function seedTrial(url, fixturePeriod = trialPeriod, review = false) {
  let current = await (await fetch(`${url}/api/state`)).json();
  let period = current.state.selected;
  for (const [index, action] of trialActions(fixturePeriod, review).entries()) {
    const response = await fetch(`${url}/api/state`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url },
      body: JSON.stringify({ period, revision: current.revision, requestId: `phase6-fixture-${review?'review':'v1'}-${index}`, action }),
    });
    current = await response.json();
    if (!response.ok) throw new Error(`Preparação ${index}: ${current.message}`);
    if (action.type === 'month') period = action.period;
  }
}
