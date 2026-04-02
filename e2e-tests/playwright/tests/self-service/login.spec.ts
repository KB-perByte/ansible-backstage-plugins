import { test, expect } from '../../fixtures/auth-context';

/**
 * Ansible self-service Authentication Tests
 * Migrated from Cypress cypress/e2e/self-service/login.cy.ts
 *
 * Key improvements over Cypress:
 * - Login once via shared browser context
 * - Browser stays open, preserving session across all tests
 * - No hard-coded cy.wait() calls
 * - Auto-retry assertions
 * - Cleaner async/await syntax
 * - Much faster - login happens once, not per test
 */

test.describe('Ansible self-service Authentication Tests', () => {
  /** Shell may not show exact "Templates" on `/`; catalog/self-service routes reflect real post-login UX. */
  test('Verify user is authenticated', async ({ page }) => {
    await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Select a Sign-in method')).not.toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page).toHaveURL(/\/self-service/);
  });

  test('Verify logged in user stays logged in across navigation', async ({
    page,
  }) => {
    await page.goto('/self-service', { waitUntil: 'domcontentloaded' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.goto('/self-service/catalog', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Select a Sign-in method')).not.toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page).toHaveURL(/\/self-service/);
  });

  test('Verify main content loads for authenticated user', async ({ page }) => {
    await page.goto('/self-service/catalog', { waitUntil: 'networkidle' });

    // Same order as tests above: session gate can lag behind layout; `main` may exist before auth resolves.
    await expect(page.getByText('Select a Sign-in method')).not.toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('main')).toBeVisible();
  });
});
