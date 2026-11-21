import { policy } from '../modules/identity/policy.mjs';
import { dispatchOne } from '../modules/identity/mail.mjs';
import { rotateBackups } from './rotate-backups.mjs';

export function startBackgroundJobs(path, config) {
  let working;
  let nextCleanup = 0;
  let lastSuccess = 0;
  const timer = setInterval(() => {
    if (working) return;
    working = (async () => {
      try {
        const now = Date.now(),
          clean = now >= nextCleanup;
        await dispatchOne(path, config, undefined, now, clean);
        if (clean) {
          rotateBackups(path, now);
          nextCleanup = now + policy.maintenanceInterval;
        }
        lastSuccess = Date.now();
      } catch {
        console.error('Fila de comunicações temporariamente indisponível.');
      } finally {
        working = undefined;
      }
    })();
  }, policy.workerTick);
  timer.unref();
  return {
    healthy: () => Date.now() - lastSuccess < 60_000,
    async stop() {
      clearInterval(timer);
      await working;
    },
  };
}
