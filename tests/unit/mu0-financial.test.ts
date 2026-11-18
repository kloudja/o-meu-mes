import { expect, it } from 'vitest';
import { balance, realized, sourceTotals, transact } from '../../src/modules/finance/domain/engine';
import { examples } from '../fixtures';

it('A20 — transferir 25 € entre contas mantém 100 € de património e zero realizado no plano', () => {
  const state = examples();
  const period = state.selected;
  const month = state.months[period];
  for (const key of Object.keys(month.initials)) month.initials[key] = null;
  month.initials['a:act-r'] = 10000;
  month.initials['a:moey-r'] = 0;
  const next = transact(
    state,
    {
      type: 'transfer',
      source: 'a:act-r',
      destination: 'a:moey-r',
      amount: 2500,
      date: `${period}-03`,
    },
    'own-transfer',
  );
  const saved = next.months[period];
  expect([balance(saved, 'a:act-r'), balance(saved, 'a:moey-r')]).toEqual([7500, 2500]);
  expect(sourceTotals(next, saved).wealth).toBe(10000);
  expect(saved.lines.every((line) => realized(saved, line.id) === 0)).toBe(true);
});

it('A20 — reforço de 20 €, despesa de 15 € pela poupança e abertura do mês seguinte', () => {
  const original = examples();
  const period = original.selected;
  const account = 'a:moey-r';
  const reserve = 'r:em';
  const date = `${period}-03`;
  const initials = original.months[period].initials;
  for (const key of Object.keys(initials)) initials[key] = null;
  initials[account] = 10000;
  initials[reserve] = 5000;

  const funded = transact(
    original,
    {
      type: 'execute',
      lineId: 'save-em',
      source: account,
      amount: 2000,
      complete: false,
      date,
    },
    'fund',
  );
  const first = funded.months[period];
  expect([balance(first, account), balance(first, reserve)]).toEqual([8000, 7000]);
  expect(sourceTotals(funded, first).wealth).toBe(15000);
  expect(realized(first, 'health')).toBe(0);

  const payment = {
    type: 'execute' as const,
    lineId: 'health',
    source: reserve,
    amount: 1500,
    complete: false,
    date,
  };
  const paid = transact(funded, payment, 'spend');
  const replay = transact(paid, payment, 'spend');
  const second = replay.months[period];
  expect([balance(second, account), balance(second, reserve)]).toEqual([8000, 5500]);
  expect(sourceTotals(replay, second).wealth).toBe(13500);
  expect(realized(second, 'health')).toBe(1500);
  expect(second.events.map((event) => event.id)).toEqual(['fund', 'spend']);

  const opened = transact(replay, { type: 'month', period: '2026-12' }, 'open');
  const december = opened.months['2026-12'];
  expect(december.initials).toMatchObject({ [account]: 8000, [reserve]: null, 'a:bank': null });
  expect(december.events).toEqual([]);
  expect(december.lines.find((line) => line.id === 'income')?.plan).toBe(120000);
});
