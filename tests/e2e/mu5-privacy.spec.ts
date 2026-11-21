import { expect, test, syntheticCredentials } from './identity-application';
import { registerOwner, createTestSpace } from './application';
import { DatabaseSync } from 'node:sqlite';

test.use({ rightsTest: true });
for (const width of [1366, 390]) {
  test(
    'MU5 direitos privados, eliminação e encerramento a ' + width + ' px',
    async ({ page, browser, application }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      const person = syntheticCredentials(),
        user = await registerOwner(page.request, application, person);
      const owner = await createTestSpace(page.request, application.url, user, 'Orçamento de casa');
      const op = application.operator!;
      const context = await browser.newContext({ baseURL: application.url });
      try {
        const login = await context.request.post('/api/identity', {
          headers: { Origin: application.url },
          data: { action: 'login', email: op.email, password: op.password, otp: op.otp() },
        });
        expect(login.ok()).toBe(true);
        const denied = await context.request.get('/api/state?spaceId=' + owner.spaceId, {
          headers: { 'X-Account': op.id },
        });
        expect(denied.status()).toBe(403);
        await page.goto('/');
        const profile = page.getByRole('button', { name: 'Definições do utilizador' });
        await profile.click();
        const panel = page
          .locator('section')
          .filter({ has: page.getByRole('heading', { name: 'Privacidade e direitos', exact: true }) });
        await panel.getByLabel('O teu pedido').fill('Solicito acesso às referências que me dizem respeito.');
        await panel.getByRole('button', { name: 'Apresentar pedido privado' }).click();
        await expect(panel.getByText('Pedido recebido.', { exact: false })).toBeVisible();
        const request = await context.request.get('/api/privacy', { headers: { 'X-Account': op.id } });
        const queue = await request.json();
        expect(queue.operator).toBe(true);
        expect(queue.cases).toHaveLength(1);
        expect(queue.cases[0]).not.toHaveProperty('subject');
        const reply = await context.request.post('/api/privacy', {
          headers: { Origin: application.url, 'X-Account': op.id },
          data: {
            action: 'answer',
            id: queue.cases[0].id,
            text: 'Identificámos a tua referência. O acesso a identificadores de terceiros foi recusado para proteger a sua privacidade.',
            decision: 'partial',
            recipients: 'Sem alteração de dados comunicados.',
          },
        });
        expect(reply.ok()).toBe(true);
        const receipts = new DatabaseSync(application.database, { readOnly: true, timeout: 5000 });
        try {
          const record = receipts
            .prepare('SELECT received,closed,due FROM privacy_cases WHERE id=?')
            .get(queue.cases[0].id)!;
          expect(Number(record.closed)).toBeGreaterThanOrEqual(Number(record.received));
          expect(Number(record.closed)).toBeLessThanOrEqual(Number(record.due));
        } finally {
          receipts.close();
        }
        await panel.getByRole('button', { name: 'Atualizar pedidos' }).click();
        await panel.getByText(/Respondido ·/).click();
        await expect(panel.getByText(/recorrer aos tribunais/)).toBeVisible();
        await panel.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: info.outputPath('mu5-direitos-' + width + '.png') });
        await page.getByRole('button', { name: 'Gerir eliminação e encerramento' }).click();
        const space = page
          .locator('details')
          .filter({ has: page.locator('summary', { hasText: 'Orçamento de casa' }) });
        await space.locator('summary').click();
        await space.getByLabel('Confirmar palavra-passe').fill(person.password);
        await space.getByRole('button', { name: 'Confirmar ação no espaço' }).click();
        await expect(space.locator('summary')).toContainText('Eliminação pendente');
        await page.getByRole('button', { name: 'Voltar aos espaços' }).click();
        await expect(page.getByText(/Espaço só de leitura até/)).toBeVisible();
        await page.screenshot({ path: info.outputPath('mu5-leitura-' + width + '.png') });
        await profile.click();
        await page.getByRole('button', { name: 'Gerir eliminação e encerramento' }).click();
        await space.locator('summary').click();
        await space.getByLabel('Confirmar palavra-passe').fill(person.password);
        await space.getByRole('button', { name: 'Confirmar cancelamento' }).click();
        await expect(space.locator('summary')).toContainText('Ativo');
        const closure = page
          .locator('details')
          .filter({ has: page.locator('summary', { hasText: 'Encerrar a minha conta' }) });
        await closure.locator('summary').click();
        await closure.getByLabel('Confirmar palavra-passe').fill(person.password);
        await closure.getByRole('button', { name: 'Confirmar encerramento da conta' }).click();
        await expect(page.getByRole('heading', { name: 'Conta em encerramento' })).toBeVisible();
        await expect(space.locator('summary')).toContainText('Ativo');
        await space.locator('summary').click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath('mu5-encerramento-' + width + '.png') });
        const db = new DatabaseSync(application.database, { readOnly: true, timeout: 5000 });
        try {
          expect(db.prepare('SELECT lifecycle FROM users WHERE id=?').get(user)?.lifecycle).toBe(
            'PendingClosure',
          );
        } finally {
          db.close();
        }
      } finally {
        await context.close();
      }
    },
  );
}
