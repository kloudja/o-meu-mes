import { defineConfig } from '@playwright/test';

const browserName = process.env.OMEUMES_QA_BROWSER ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('Navegador de teste desconhecido.');

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/mu3',
  testMatch: process.env.OMEUMES_QA_MANAGER ? 'native-manager.spec.ts' : '*.spec.ts',
  testIgnore: process.env.OMEUMES_QA_MANAGER ? [] : ['native-manager.spec.ts'],
  workers: 1,
  reporter: 'list',
  use: {
    browserName: browserName as 'chromium' | 'firefox' | 'webkit',
    headless: true,
    locale: 'pt-PT',
    viewport: { width: 1366, height: 768 },
    launchOptions: {
      executablePath: process.env.BROWSER_PATH || (browserName === 'chromium' && process.platform === 'win32'
        ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined),
    },
    // Os percursos de autenticação incluem fatores de uso único.
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  timeout: 45_000,
});
