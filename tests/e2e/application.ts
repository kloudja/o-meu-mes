import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, type Page } from '@playwright/test';
import { connect, migrate } from '../../src/server/storage.mjs';
import { persist } from '../../src/server/repository';
import { examples, writeTestCatalog } from '../fixtures';

type Application = { url: string; path: string };

export const test = base.extend<{
  application: Application;
  openExamples: (page: Page) => Promise<void>;
  showLocalData: boolean;
}>({
  showLocalData: [false, { option: true }],
  application: async ({ showLocalData }, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'omeumes-test-browser-'));
    const path = join(directory, 'browser.sqlite');
    writeTestCatalog(directory);
    migrate(path);
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', resolve);
    });
    const { port } = probe.address() as { port: number };
    await new Promise<void>(resolve => probe.close(() => resolve()));
    const url = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      env: { ...process.env, OMEUMES_DB_PATH: path, OMEUMES_TEST_MODE: '1', OMEUMES_SHOW_LOCAL_DATA: showLocalData ? '1' : '0', NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    server.stdout.on('data', chunk => { output += chunk; });
    server.stderr.on('data', chunk => { output += chunk; });
    let exited = false;
    const stopped = new Promise<void>(resolve => {
      server.once('close', () => { exited = true; resolve(); });
      server.once('error', error => { output += error.message; });
    });
    try {
      for (let attempt = 0; attempt < 80 && !exited; attempt++) {
        const response = await fetch(url + '/api/state', { signal: AbortSignal.timeout(500) }).catch(() => null);
        if (response?.ok) {
          await use({ url, path });
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Aplicação de teste indisponível em ${path}\n${output}`);
    } finally {
      if (!exited) server.kill();
      await stopped;
    }
  },
  baseURL: async ({ application }, use) => { await use(application.url); },
  request: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
    try { await use(api); } finally { await api.dispose(); }
  },
  openExamples: async ({ application }, use) => {
    await use(async page => {
      const db = connect(application.path);
      try {
        db.exec('BEGIN IMMEDIATE');
        // Replace the empty month created by migrate in this test's own database.
        db.exec('DELETE FROM initials; DELETE FROM months;');
        persist(db, examples());
        db.exec('COMMIT');
      } finally { db.close(); }
      await page.goto('/');
      await page.locator('.app-shell[data-ready="true"]').waitFor();
    });
  },
});

export { expect } from '@playwright/test';
