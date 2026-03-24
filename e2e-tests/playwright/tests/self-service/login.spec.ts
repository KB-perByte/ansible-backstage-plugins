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
  test('Verify user is authenticated', async ({ page }) => {
    // Navigate to home (already authenticated via shared context)
    await page.goto('/');

    // Verify successful login by checking for Templates navigation
    await expect(
      page.getByText('Templates', { exact: true }).first(),
    ).toBeVisible();

    // Should not see login prompt
    await expect(page.getByText('Select a Sign-in method')).not.toBeVisible();

    // Verify main content is visible
    await expect(page.locator('main')).toBeVisible();
  });

  test('Verify logged in user stays logged in across navigation', async ({
    page,
  }) => {
    // Navigate to different pages (already authenticated)
    await page.goto('/self-service');
    await page.goto('/');

    // Should still be logged in (no login prompt)
    await expect(page.getByText('Select a Sign-in method')).not.toBeVisible();

    // Verify Templates navigation is visible
    await expect(
      page.getByText('Templates', { exact: true }).first(),
    ).toBeVisible();
  });

  test('Verify main content loads for authenticated user', async ({ page }) => {
    await page.goto('/');

    // Wait for and verify main content
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();

    // Verify Templates navigation is visible
    const templatesLink = page.getByText('Templates', { exact: true }).first();
    await expect(templatesLink).toBeVisible();
  });
});
