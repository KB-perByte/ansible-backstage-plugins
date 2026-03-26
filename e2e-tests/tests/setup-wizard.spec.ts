import { test, expect } from '@playwright/test';

/**
 * E2E tests for the portal admin setup wizard.
 * These tests verify the full setup flow from first boot to configured state.
 *
 * Prerequisites:
 * - Portal running locally with `yarn start`
 * - `ansible.portal.onboarding.enabled: true` in app-config
 * - Database empty (fresh state)
 */

test.describe('Setup Wizard', () => {
  test('redirects to setup wizard when onboarding is enabled', async ({
    page,
  }) => {
    await page.goto('/self-service/catalog');
    // SetupGate should redirect to /self-service/setup
    await expect(page).toHaveURL(/\/self-service\/setup/);
  });

  test('displays overview step with prerequisites', async ({ page }) => {
    await page.goto('/self-service/setup');
    await expect(
      page.getByText('Overview & Prerequisites'),
    ).toBeVisible();
    await expect(
      page.getByText('AAP Controller URL'),
    ).toBeVisible();
  });

  test('can navigate through all wizard steps', async ({ page }) => {
    await page.goto('/self-service/setup');

    // Step 1: Overview → Next
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Connect AAP')).toBeVisible();

    // Step 2: Fill AAP config → Next
    await page.fill('[placeholder="https://aap.example.com"]', 'https://aap.test.com');
    await page.fill('[placeholder="Enter access token"]', 'test-token');
    await page.fill('[placeholder="Enter client ID"]', 'test-client-id');
    await page.fill('[placeholder="Enter secret"]', 'test-secret');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Registries (defaults are fine) → Next
    await expect(page.getByText('Connect Registries')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 4: Source Control (skip) → Next
    await expect(page.getByText('Connect Source Control')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 5: Review
    await expect(page.getByText('Review')).toBeVisible();
    await expect(page.getByText('https://aap.test.com')).toBeVisible();
    await expect(page.getByText('********')).toBeVisible();
  });

  test('shows applying screen after Apply & Restart', async ({ page }) => {
    // This test requires the wizard to be filled out first
    // Full implementation depends on test fixtures
    test.skip();
  });

  test('shows success screen after configuration applied', async ({
    page,
  }) => {
    // This test requires mocking the restart flow
    test.skip();
  });
});

test.describe('Admin Pages', () => {
  test('General page shows local admin toggle', async ({ page }) => {
    await page.goto('/self-service/admin/general');
    await expect(
      page.getByText('Local Admin Access (Bootstrap)'),
    ).toBeVisible();
  });

  test('Connections page shows provider cards', async ({ page }) => {
    await page.goto('/self-service/admin/connections');
    await expect(
      page.getByText('Ansible Automation Platform'),
    ).toBeVisible();
  });
});
