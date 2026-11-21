// Loaded only in the synthetic supervisor. Network timeouts still use real timers.
if (!process.send || process.env.OMEUMES_TEST_MODE !== '1') throw new Error('Relógio exclusivo de ensaio.');
let clock = Number(process.env.OMEUMES_QA_CLOCK);
if (!Number.isSafeInteger(clock)) throw new Error('Instante de ensaio inválido.');
Date.now = () => clock;
process.on('message', (next) => {
  if (Number.isSafeInteger(next) && next >= clock) clock = next;
});
