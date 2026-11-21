const minute = 60_000;
const day = 24 * 60 * minute;

// Durations are milliseconds. No client-supplied deadline participates in a decision.
export const policy = Object.freeze({
  idle: 30 * minute,
  absolute: 12 * 60 * minute,
  rememberedIdle: 7 * day,
  rememberedAbsolute: 30 * day,
  recent: 10 * minute,
  verify: day,
  reset: 30 * minute,
  email: 30 * minute,
  recoverEmail: 30 * minute,
  invite: 7 * day,
  otpWindow: 1,
  otpPeriod: 30,
  recoveryCodes: 8,
  resend: minute,
  attemptWindow: 15 * minute,
  attempts: 12,
  networkAttempts: 180,
  day,
  dailyMail: 280,
  maxDeliveries: 5,
  retry: minute,
  lease: minute,
  transportTimeout: 10_000,
  workerTick: 1000,
  deliveryCheck: 15 * minute,
  deliveryWindow: day,
  maintenanceInterval: 60 * minute,
  refresh: 15_000,
  duplicateWarning: 5 * minute,
  unverifiedRetention: 30 * day,
  operationalRetention: 30 * day,
  auditRetention: 90 * day,
  backupRetention: 30 * day,
  hashMemory: 19456,
  hashIterations: 2,
  minPassword: 15,
  maxPassword: 256,
});

if (
  Object.entries(policy).some(
    ([name, value]) => !Number.isSafeInteger(value) || value < (name === 'otpWindow' ? 0 : 1),
  ) ||
  policy.idle > policy.absolute ||
  policy.rememberedIdle > policy.rememberedAbsolute ||
  policy.recent > policy.idle ||
  policy.transportTimeout >= policy.lease ||
  policy.minPassword > policy.maxPassword ||
  policy.otpWindow > 1
) {
  throw new Error('Os prazos ou limites da identidade são inválidos.');
}

/** @param {Record<string, string | undefined>} [env] */
export function settings(env = process.env) {
  const key = Buffer.from(env.OMEUMES_AUTH_KEY || '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== env.OMEUMES_AUTH_KEY)
    throw new Error('Chave de identidade inválida.');
  const origin = new URL(env.OMEUMES_AUTH_ORIGIN || 'http://127.0.0.1:3000');
  if (
    origin.origin !== (env.OMEUMES_AUTH_ORIGIN || 'http://127.0.0.1:3000') ||
    !(
      origin.protocol === 'https:' ||
      (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))
    )
  ) {
    throw new Error('Origem de autenticação inválida.');
  }
  const transport = env.OMEUMES_MAIL_TRANSPORT || 'test';
  const inviteDays = Number(env.OMEUMES_INVITE_DAYS ?? 7);
  if (!Number.isInteger(inviteDays) || inviteDays < 1 || inviteDays > 30)
    throw new Error('O prazo dos convites deve ser entre 1 e 30 dias.');
  if (
    !['brevo', 'test'].includes(transport) ||
    (transport === 'brevo' &&
      (env.OMEUMES_TEST_MODE === '1' ||
        !env.BREVO_API_KEY ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.BREVO_SENDER || '') ||
        origin.protocol !== 'https:'))
  ) {
    throw new Error('Configuração de email inválida.');
  }
  return {
    key,
    origin: origin.origin,
    secure: origin.protocol === 'https:',
    transport,
    inviteLifetime: inviteDays * day,
    mailbox: env.OMEUMES_TEST_MODE === '1' && env.OMEUMES_TEST_MAILBOX === '1',
    apiKey: env.BREVO_API_KEY,
    sender: env.BREVO_SENDER,
  };
}
