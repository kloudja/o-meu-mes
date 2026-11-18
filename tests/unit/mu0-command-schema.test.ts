import { expect, it } from 'vitest';
import { parseAction, parseCommand } from '../../src/modules/finance/contracts/command-schema';
import { canonical } from '../../src/modules/finance/domain/actions';

const transfer = {
  type: 'transfer',
  source: 'a:first',
  destination: 'a:second',
  amount: 2500,
  date: '2026-11-01',
};
const command = { period: '2026-11', revision: 0, requestId: 'test', action: transfer };

it('preserva o conteúdo de pedidos antigos e da tentativa de correção', () => {
  const account = {
    type: 'account',
    account: { id: 'first', name: 'Conta A', color: '#aAbBcC', restricted: false, baseInitial: null },
  };
  expect(canonical(parseAction(account))).toBe(canonical(account));
  const correction = {
    type: 'correct',
    id: 'payment',
    replacement: { ...transfer, initials: { 'a:first': 10000 } },
  };
  expect(parseCommand({ ...command, action: correction }).action).toEqual(correction);
});

it.each([
  [{ ...command, period: '2026-13' }, 'PERIOD'],
  [{ ...command, requestId: '__proto__' }, 'ID'],
  [{ ...command, revision: -1 }, 'INPUT'],
  [{ ...command, requestId: 'a'.repeat(201) }, 'INPUT'],
  [{ ...command, extra: 1 }, 'INPUT'],
  [{ ...command, action: { ...transfer, initials: { ['__proto__']: 0 } } }, 'ID'],
  [{ ...command, action: { ...transfer, initials: { 'a:first': 1.5 } } }, 'INPUT'],
  [{ ...command, action: { ...transfer, amount: '2500' } }, 'INPUT'],
  [{ ...command, action: { ...transfer, amount: Number.MAX_SAFE_INTEGER + 1 } }, 'INPUT'],
  [{ ...command, action: { ...transfer, date: 'a'.repeat(2001) } }, 'INPUT'],
  [
    { ...command, action: { type: 'correct', id: 'event', replacement: { ...transfer, extra: true } } },
    'INPUT',
  ],
  [
    {
      ...command,
      action: { type: 'correct', id: 'event', replacement: { type: 'snapshot', date: '2026-11-01' } },
    },
    'INPUT',
  ],
  [
    {
      ...command,
      action: { type: 'recordSuggestedTransfers', period: command.period, date: transfer.date, routes: [] },
    },
    'INPUT',
  ],
  [
    {
      ...command,
      action: {
        type: 'recordSuggestedTransfers',
        period: command.period,
        date: transfer.date,
        routes: [{ amount: 100 }],
      },
    },
    'INPUT',
  ],
  [Object.create(command), 'INPUT'],
  [{ ...command, action: Object.create(transfer) }, 'INPUT'],
  [{ ...command, action: { ...transfer, initials: undefined } }, 'INPUT'],
])('conserva o código de recusa da fronteira %#', (input, code) => {
  expect(() => parseCommand(input)).toThrow(expect.objectContaining({ code }));
});

it('deixa a revisão e o domínio decidir sobre valores de negócio', () => {
  const unknownMode = { type: 'occurrence', id: 'reminder', mode: 'unknown' };
  expect(parseAction(unknownMode)).toEqual(unknownMode);
  expect(parseAction({ ...transfer, amount: -1 })).toEqual({ ...transfer, amount: -1 });
});

it('exige membros próprios também em chamadas JavaScript diretas fora do transporte JSON', () => {
  const inheritedType = Object.assign(Object.create({ type: 'month' }), { period: command.period });
  const inheritedOption = Object.assign(Object.create({ initials: {} }), transfer);
  for (const value of [inheritedType, inheritedOption]) {
    expect(() => parseAction(value)).toThrow(expect.objectContaining({ code: 'INPUT' }));
  }
});
