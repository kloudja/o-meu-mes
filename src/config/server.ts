import { z } from 'zod';

const settings = z.object({
  OMEUMES_RECOVERY_SCOPE: z.string().optional(),
  OMEUMES_SHOW_LOCAL_DATA: z.string().optional(),
});

export function readServerSettings(env: NodeJS.ProcessEnv = process.env) {
  const values = settings.parse(env);
  return {
    recoveryScope: values.OMEUMES_RECOVERY_SCOPE,
    showLocalData: values.OMEUMES_SHOW_LOCAL_DATA === '1',
  };
}
