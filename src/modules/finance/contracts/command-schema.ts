import { z } from 'zod';
import type { Action } from '../domain/actions';
import { DomainError, validId, validPeriod } from '../domain/validation';
import type { Command } from './command';

const text = z.string().max(2000);
const cents = z.int();
const planned = cents.nullable();
const flag = z.boolean();
const object = z.custom<Record<string, unknown>>(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
);
const entry = { amount: cents, date: text, source: text, initials: object.exactOptional() };
const route = z.strictObject({ source: text, destination: text, amount: cents });
const line = z.strictObject({
  id: text,
  name: text,
  kind: text,
  plan: planned,
  accountId: text,
  categoryId: text,
  reserveId: text.exactOptional(),
  variable: flag.exactOptional(),
  dueDate: text.exactOptional(),
});
const execution = z.strictObject({
  ...entry,
  description: text.exactOptional(),
  reserveAfter: cents.exactOptional(),
  shortfall: z.strictObject({ available: cents, secondSource: text.nullable() }).exactOptional(),
});
const execute = z.strictObject({
  type: z.literal('execute'),
  ...execution.shape,
  lineId: text,
  complete: flag,
  remaining: flag.exactOptional(),
  total: flag.exactOptional(),
  includedInTotal: text.exactOptional(),
});
const transfer = z.strictObject({ type: z.literal('transfer'), ...entry, destination: text });
const reconcile = z.strictObject({
  type: z.literal('reconcile'),
  source: text,
  amount: cents,
  date: text,
  note: text,
});
const save = z.strictObject({
  type: z.literal('save'),
  ...entry,
  reserveId: text,
  lineId: text.exactOptional(),
  complete: flag.exactOptional(),
});
const replacement = z.discriminatedUnion('type', [execute, transfer, reconcile, save]);
const target = z.literal('base').exactOptional();
const actionSchema = z.discriminatedUnion('type', [
  execute,
  transfer,
  reconcile,
  save,
  z.strictObject({ type: z.literal('correct'), id: text, replacement }),
  z.strictObject({ type: z.literal('associateSaving'), eventId: text, lineId: text, amount: cents }),
  z.strictObject({
    type: z.literal('recordSuggestedTransfers'),
    date: text,
    period: text,
    routes: z.array(route).min(1),
  }),
  z.strictObject({ type: z.literal('month'), period: text }),
  z.strictObject({ type: z.literal('snapshot'), date: text }),
  z.strictObject({ type: z.literal('initial'), source: text, amount: cents }),
  z.strictObject({ type: z.literal('line'), line, target, execution: execution.exactOptional() }),
  z.strictObject({ type: z.literal('removeLine'), id: text, target }),
  z.strictObject({ type: z.literal('void'), id: text }),
  z.strictObject({ type: z.literal('occurrence'), id: text, mode: text, lineId: text.exactOptional() }),
  z.strictObject({ type: z.literal('deleteAccount'), id: text }),
  z.strictObject({
    type: z.literal('account'),
    account: z.strictObject({
      id: text,
      name: text,
      color: text.regex(/^#[0-9a-fA-F]{6}$/),
      restricted: flag,
      archived: flag.exactOptional(),
      // Part of the fingerprint of previously confirmed commands.
      baseInitial: planned.exactOptional(),
    }),
  }),
  z.strictObject({
    type: z.literal('category'),
    category: z.strictObject({ id: text, name: text, archived: flag.exactOptional() }),
  }),
  z.strictObject({
    type: z.literal('reserve'),
    reserve: z.strictObject({ id: text, name: text, accountId: text }),
  }),
  z.strictObject({
    type: z.literal('recurring'),
    definition: z.strictObject({
      id: text,
      name: text,
      date: text,
      frequency: text,
      active: flag,
      amount: planned,
      accountId: text,
      reserveId: text.exactOptional(),
      reminderText: text.exactOptional(),
      reminderDays: cents.exactOptional(),
    }),
  }),
]);

const envelope = z.strictObject({
  period: text,
  requestId: text,
  revision: cents,
  action: object,
  duplicateConfirmation: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .exactOptional(),
});

function invalid(): never {
  throw new DomainError('INPUT', 'O pedido contém campos inválidos. Reveja o formulário.');
}

// Zod can read inherited JS properties. Commands contain only own JSON members,
// including when a caller invokes this boundary directly instead of using HTTP.
function hasOwnMembers(input: unknown, parsed: unknown): boolean {
  if (input === parsed || !parsed || typeof parsed !== 'object') return true;
  if (!input || typeof input !== 'object') return false;
  return Object.entries(parsed).every(
    ([key, child]) => Object.hasOwn(input, key) && hasOwnMembers(Reflect.get(input, key), child),
  );
}

export function parseAction(value: unknown): Action {
  const result = actionSchema.safeParse(value);
  if (!result.success || !hasOwnMembers(value, result.data)) invalid();
  const action = result.data;
  const movement =
    action.type === 'correct' ? action.replacement : action.type === 'line' ? action.execution : action;
  if (movement && 'initials' in movement && movement.initials) {
    for (const [source, initial] of Object.entries(movement.initials)) {
      validId(source);
      if (!cents.safeParse(initial).success) invalid();
    }
  }
  // The original wire contract accepts strings for kind, frequency and mode.
  // transact checks their business meaning after durable replay/revision checks.
  return action as Action;
}

export function parseCommand(value: unknown): Command {
  const result = envelope.safeParse(value);
  if (!result.success || !hasOwnMembers(value, result.data)) invalid();
  const { period, requestId, revision, action, duplicateConfirmation } = result.data;
  validPeriod(period);
  validId(requestId);
  if (requestId.length > 200 || revision < 0) invalid();
  return { period, requestId, revision, action: parseAction(action), duplicateConfirmation };
}
