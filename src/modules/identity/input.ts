import { z } from 'zod';
import { dictionary } from '@zxcvbn-ts/language-common';
import { policy } from './policy.mjs';
const blocked = new Set(dictionary['passwords-common']);
export const email = z
  .string()
  .trim()
  .max(254)
  .toLowerCase()
  .pipe(z.email({ error: 'Indica um endereço de email válido.' }));
const name = z.string().trim().min(1).max(80);
const pass = z
  .string()
  .min(1)
  .max(policy.maxPassword * 2);
const newPassword = pass.superRefine((value, ctx) => {
  const length = [...value].length;
  if (length < policy.minPassword || length > policy.maxPassword)
    ctx.addIssue({ code: 'custom', message: 'Usa entre 15 e 256 caracteres.' });
  else if (blocked.has(value.trim().toLowerCase()) || /^(.)\1+$/u.test(value))
    ctx.addIssue({ code: 'custom', message: 'Esta palavra-passe é demasiado comum. Escolhe outra.' });
});
const token = z.string().regex(/^[\w-]{43}$/, { error: 'A ligação é inválida. Pede uma nova ligação.' });
const otp = z.string().regex(/^\d{6}$/, { error: 'Indica os seis algarismos do autenticador.' });
const proof = { password: pass, otp: otp.optional() };
const recovery = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-F]{8}(?:-[0-9A-F]{8}){3}$/, { error: 'Introduz o código de recuperação completo.' });
const action = <K extends string, S extends z.ZodRawShape>(k: K, shape: S) =>
  z.strictObject({ action: z.literal(k), ...shape });
export const identityInput = z.discriminatedUnion('action', [
  action('register', {
    firstName: name,
    lastName: name,
    email,
    password: newPassword,
    country: z.literal('PT'),
    adult: z.literal(true),
    terms: z.literal('dev-2'),
    invite: z.string().trim().max(256).optional(),
  }),
  action('login', { email, ...proof, remember: z.boolean().optional() }),
  action('reauth', proof),
  action('closeAccount', proof),
  action('deleteSpace', { ...proof, spaceId: z.uuid() }),
  action('cancelDeletion', { ...proof, spaceId: z.uuid() }),
  action('cancelProposal', { ...proof, spaceId: z.uuid() }),
  action('proposeTransfer', { ...proof, spaceId: z.uuid(), memberId: z.uuid() }),
  action('logout', {}),
  action('activity', {}),
  action('interfaceLocale', { locale: z.literal('pt-PT') }),
  action('verify', { token, password: pass }),
  action('resend', {}),
  action('forgot', { email }),
  action('reset', { token, newPassword }),
  action('password', { ...proof, newPassword }),
  action('email', { ...proof, newEmail: email }),
  action('confirmEmail', { token, newPassword: newPassword.optional() }),
  action('codes', proof),
  action('enroll', { password: pass.optional(), otp: otp.optional() }),
  action('activate', { otp }),
  action('disable', { password: pass, otp }),
  action('recoverEmail', { email, code: recovery, newEmail: email }),
  action('recoverMfa', { email, password: pass, code: recovery }),
  action('revoke', { sessionId: z.uuid() }),
  action('revokeAll', {}),
]);
export type Intent = z.infer<typeof identityInput>;
export function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    const fallback: Record<string, string> = {
      country: 'Escolhe Portugal.',
      adult: 'Confirma a declaração de maioridade.',
      terms: 'É necessária a aceitação desta versão dos termos.',
      firstName: 'Indica o primeiro nome (até 80 caracteres).',
      lastName: 'Indica o último nome (até 80 caracteres).',
      password: 'Indica a palavra-passe.',
      token: 'A ligação é inválida.',
    };
    errors[key] =
      issue.code === 'custom' || issue.code === 'invalid_format'
        ? issue.message
        : (fallback[key] ?? 'Revê este campo.');
  }
  return errors;
}
