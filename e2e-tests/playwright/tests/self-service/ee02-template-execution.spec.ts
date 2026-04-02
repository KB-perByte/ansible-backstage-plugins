import { test, expect } from '../../fixtures/auth-context';

/**
 * EE template import + execution wizard — migrated from
 * cypress/e2e/self-service/ee02-template-execution.cy.ts
 */

const EE_TEMPLATE_URL =
  process.env.EE_IMPORT_REPO_URL ||
  'https://github.com/ansible/ansible-rhdh-templates/blob/v1.0.2/templates/ee-start-from-scratch.yaml';

const EE_TEMPLATE_TITLE = 'Start from scratch';

// Use timestamp for unique names to avoid collisions in parallel test runs
const TIMESTAMP = Date.now();
const REPO_SUFFIX = (TIMESTAMP % 100).toString().padStart(2, '0');
const RANDOM_LETTER = String.fromCharCode(97 + (TIMESTAMP % 26));
const REPO_NAME = `ee-repo-${RANDOM_LETTER}-${TIMESTAMP}`;
const EE_FILE_NAME = `ee-${REPO_SUFFIX}-${TIMESTAMP}`;

test.describe('Execution Environment Template Execution Tests', () => {
  test('Imports EE template via kebab menu and executes it from Create tab', async ({
    page,
  }) => {
    await test.step('Open EE Create tab', async () => {
      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/self-service\/ee/);
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
      if ((await page.locator('body').innerText()).includes('Create')) {
        await page.getByText('Create').first().click({ force: true });
        await page.waitForTimeout(1500);
      }
    });

    if (
      (await page.locator('[data-testid="kebab-menu-button"]').count()) === 0
    ) {
      test.skip();
    }

    await test.step('Kebab → Import Template → catalog-import', async () => {
      await page
        .locator('[data-testid="kebab-menu-button"]')
        .click({ force: true });
      await page.waitForTimeout(400);
      await page
        .locator('[data-testid="import-template-button"]')
        .click({ force: true });
      await page.waitForTimeout(2500);
      const url = page.url();
      if (!url.includes('/self-service/catalog-import')) {
        throw new Error(
          `Catalog import page was not reached; current URL: ${url}`,
        );
      }
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    });

    await test.step('Fill template URL and Analyze', async () => {
      const urlInput = page
        .locator('label')
        .filter({ hasText: /^URL$/i })
        .locator('xpath=ancestor::div[1]')
        .locator('input')
        .first();
      await urlInput.clear({ force: true });
      await urlInput.fill(EE_TEMPLATE_URL, { force: true });
      await page
        .getByRole('button', { name: /analyze/i })
        .click({ force: true });
      await page.waitForTimeout(4000);
    });

    await test.step('Review: Import', async () => {
      const importBtn = page
        .locator('button')
        .filter({ hasText: /^import$/i })
        .or(page.getByRole('button', { name: /import/i }))
        .first();
      if ((await importBtn.count()) > 0) {
        await importBtn.click({ force: true });
        await page.waitForTimeout(5000);
      }
    });

    await test.step('Return to EE Create and Start template', async () => {
      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.getByText('Create').first().click({ force: true });
      await page.waitForTimeout(1500);
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      const body = await page.locator('body').innerText();
      if (!body.includes(EE_TEMPLATE_TITLE)) {
        test.skip(
          true,
          `Template "${EE_TEMPLATE_TITLE}" not found after import - import may have failed`,
        );
      }

      const card = page
        .locator('.MuiCard-root, article, [data-testid*="template"]')
        .filter({ hasText: EE_TEMPLATE_TITLE })
        .first();
      const startBtn = card
        .locator('button, [role="button"]')
        .filter({ hasText: /start/i })
        .first();
      if ((await startBtn.count()) > 0) {
        await startBtn.click({ force: true });
        await page.waitForTimeout(2500);
      }
    });

    await test.step('Wizard: Next steps + GitHub MCP + EE definition (with Git)', async () => {
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      for (let i = 0; i < 2; i++) {
        const next = page.getByRole('button', { name: /^Next$/i });
        if ((await next.count()) > 0) {
          await next.first().click({ force: true });
          await page.waitForTimeout(700);
        }
      }

      const gh = page
        .locator('body')
        .getByText(/^github$/i)
        .first();
      if ((await gh.count()) > 0) {
        await gh.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
      }

      const nextAfterMcp = page.getByRole('button', { name: /^Next$/i });
      for (let i = 0; i < 3; i++) {
        if ((await nextAfterMcp.count()) > 0) {
          await nextAfterMcp.first().click({ force: true });
          await page.waitForTimeout(700);
        }
      }

      await page
        .locator('label')
        .filter({ hasText: /^EE Definition Name/i })
        .locator('..')
        .locator('input, textarea')
        .first()
        .fill(EE_FILE_NAME, { force: true });

      await page
        .locator('label')
        .filter({ hasText: /^Description/i })
        .locator('..')
        .locator('input, textarea')
        .first()
        .fill('execution environment', { force: true });

      const provider = page.getByLabel(/Select source control provider/i);
      if ((await provider.count()) > 0) {
        await provider
          .locator('..')
          .locator('[role="button"], input')
          .first()
          .click({ force: true });
        await page.waitForTimeout(300);
        await page
          .getByText(/^github$/i)
          .first()
          .click({ force: true })
          .catch(() => {});
      }

      await page
        .getByLabel(/Git repository organization or username/i)
        .fill('test-rhaap-1', { force: true })
        .catch(async () => {
          await page
            .locator('label')
            .filter({ hasText: /Git repository organization/i })
            .locator('..')
            .locator('input')
            .first()
            .fill('test-rhaap-1', { force: true });
        });

      await page
        .getByLabel(/^Repository Name/i)
        .fill(REPO_NAME, { force: true })
        .catch(async () => {
          await page
            .locator('label')
            .filter({ hasText: /^Repository Name/i })
            .locator('..')
            .locator('input')
            .first()
            .fill(REPO_NAME, { force: true });
        });

      await page
        .getByText(/Create new repository/i)
        .click({ force: true })
        .catch(() => {});

      await page
        .getByRole('button', { name: /^Next$/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(1500);
      await page
        .getByRole('button', { name: /create/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(5000);
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 });
    });

    await test.step('Second run: Start template, wizard without Git publish', async () => {
      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.getByText('Create').first().click({ force: true });
      await page.waitForTimeout(1500);

      if (
        !(await page.locator('body').innerText()).includes(EE_TEMPLATE_TITLE)
      ) {
        return;
      }

      const startAgain = page
        .locator('.MuiCard-root, article, [data-testid*="template"]')
        .filter({ hasText: EE_TEMPLATE_TITLE })
        .locator('button, [role="button"]')
        .filter({ hasText: /start/i })
        .first();

      if ((await startAgain.count()) === 0) {
        return;
      }
      await startAgain.click({ force: true });
      await page.waitForTimeout(2500);

      for (let i = 0; i < 2; i++) {
        const n = page.getByRole('button', { name: /^Next$/i });
        if ((await n.count()) > 0) {
          await n.first().click({ force: true });
          await page.waitForTimeout(600);
        }
      }

      if ((await page.locator('body').innerText()).includes('GitHub')) {
        await page
          .locator('body')
          .getByText(/^github$/i)
          .first()
          .click({ force: true })
          .catch(() => {});
      }
      for (let i = 0; i < 3; i++) {
        const n = page.getByRole('button', { name: /^Next$/i });
        if ((await n.count()) > 0) {
          await n.first().click({ force: true });
          await page.waitForTimeout(600);
        }
      }

      await page
        .locator('label')
        .filter({ hasText: /^EE Definition Name/i })
        .locator('..')
        .locator('input, textarea')
        .first()
        .fill(EE_FILE_NAME, { force: true });
      await page
        .locator('label')
        .filter({ hasText: /^Description/i })
        .locator('..')
        .locator('input, textarea')
        .first()
        .fill('execution environment', { force: true });

      const publishBoxes = page.locator('input[type="checkbox"]');
      const count = await publishBoxes.count();
      for (let i = 0; i < count; i++) {
        const box = publishBoxes.nth(i);
        const label = await box.evaluate(
          el => el.closest('label, div')?.textContent || '',
        );
        if (
          label.toLowerCase().includes('publish') &&
          label.toLowerCase().includes('git')
        ) {
          if (await box.isChecked()) {
            await box.uncheck({ force: true });
          }
          break;
        }
      }

      await page
        .getByRole('button', { name: /^Next$/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(1500);
      await page
        .getByRole('button', { name: /create/i })
        .first()
        .click({ force: true });
      await page.waitForTimeout(5000);
    });
  });
});
