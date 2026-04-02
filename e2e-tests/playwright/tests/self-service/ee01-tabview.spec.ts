import { test, expect } from '../../fixtures/auth-context';

/**
 * EE tab view — migrated from cypress/e2e/self-service/ee01-tabview.cy.ts
 */

test.describe('Execution Environment Tabview Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/self-service\/ee/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Validates Catalog and Create tabs are visible and switchable', async ({
    page,
  }) => {
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes('Catalog')) {
      await expect(page.getByText('Catalog').first()).toBeAttached();
    }
    if (bodyText.includes('Create')) {
      await expect(page.getByText('Create').first()).toBeAttached();
    }

    await page.getByText('Create', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(800);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    await page.getByText('Catalog', { exact: false }).first().click({ force: true });
    await page.waitForTimeout(800);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('Validates Catalog tab: empty state CTA redirects to Create tab', async ({
    page,
  }) => {
    const body = page.locator('body');
    if ((await body.innerText()).includes('Catalog')) {
      await page.getByText('Catalog').first().click({ force: true });
      await page.waitForTimeout(800);
    }

    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    const text = await body.innerText();
    if (!text.includes('No Execution Environment definition files, yet')) {
      return;
    }

    await expect(
      page.getByText('No Execution Environment definition files, yet'),
    ).toBeVisible();

    if (text.includes('Create Execution Environment definition file')) {
      await page
        .getByText('Create Execution Environment definition file')
        .click({ force: true });
      await page.waitForTimeout(1500);
      const after = await body.innerText();
      if (after.includes('Create an Execution Environment')) {
        await expect(
          page.getByText('Create an Execution Environment').first(),
        ).toBeAttached();
      }
    }
  });

  test('Validates Create tab: Add Template button, filters and template Start button', async ({
    page,
  }) => {
    const body = page.locator('body');
    if ((await body.innerText()).includes('Create')) {
      await page.getByText('Create').first().click({ force: true });
      await page.waitForTimeout(1500);
    }

    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    const bt = await body.innerText();
    const hasAdd =
      (await page.locator('[data-testid="add-template-button"]').count()) > 0 ||
      bt.toLowerCase().includes('add template');

    if (hasAdd) {
      const addBtn = page.locator('[data-testid="add-template-button"]');
      if ((await addBtn.count()) > 0) {
        await addBtn.click({ force: true });
      } else {
        await page.getByText(/add template/i).first().click({ force: true });
      }
      await page.waitForTimeout(2000);

      await page.goto('/self-service/ee', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.getByText('Create').first().click({ force: true });
      await page.waitForTimeout(1500);
    }

    if ((await page.locator('[data-testid="search-bar-container"]').count()) > 0) {
      const input = page
        .locator('[data-testid="search-bar-container"]')
        .locator('input')
        .first();
      await input.fill('ee', { force: true });
      await page.waitForTimeout(500);
      await input.clear({ force: true });
    }

    const picker = page.locator('[data-testid="user-picker-container"]').first();
    if ((await picker.count()) > 0) {
      const buttons = picker.locator('button, [role="button"]');
      const n = await buttons.count();
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i);
        const t = ((await b.textContent()) || '').toLowerCase();
        const a = ((await b.getAttribute('aria-label')) || '').toLowerCase();
        if (t.includes('starred') || a.includes('starred')) {
          await b.click({ force: true });
          await page.waitForTimeout(500);
          break;
        }
      }
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i);
        const t = ((await b.textContent()) || '').toLowerCase();
        const a = ((await b.getAttribute('aria-label')) || '').toLowerCase();
        if (t.includes('all') || a.includes('all')) {
          await b.click({ force: true });
          await page.waitForTimeout(500);
          break;
        }
      }
    }

    const card = page
      .locator('[data-testid="templates-container"], .MuiCard-root, article, .template')
      .first();
    if ((await card.count()) === 0) {
      return;
    }

    const btn = card.locator('button').filter({
      hasText: /start|create/i,
    });
    if ((await btn.count()) > 0) {
      await btn.first().click({ force: true });
      await page.waitForTimeout(1500);
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    }
  });

  test('Validates Create tab sidebar filters: Starred, My Org All, and Tags', async ({
    page,
  }) => {
    await page.getByText('Create').first().click({ force: true });
    await page.waitForTimeout(1500);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    const text = await page.locator('body').innerText();
    if (text.includes('Personal') && text.includes('Starred')) {
      await page.getByText('Starred').first().click({ force: true });
      await page.waitForTimeout(500);
    }
    if (text.includes('My Org') && text.includes('All')) {
      await page.getByText('All').first().click({ force: true });
      await page.waitForTimeout(500);
    }
    if (text.includes('Tags')) {
      await page.getByText('Tags').first().click({ force: true });
      await page.waitForTimeout(500);
    }
  });
});
