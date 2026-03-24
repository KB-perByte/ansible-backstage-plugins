import { test, expect } from '@playwright/test';

/**
 * Debug test to see what's actually on the page after login
 */

test('Debug - check page structure after auth', async ({ page }) => {
  // Go to the URL that the auth flow lands on
  await page.goto('/');
  await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

  // Check if login needed
  const needsLogin = await page
    .getByText('Select a Sign-in method')
    .isVisible()
    .catch(() => false);

  if (needsLogin) {
    // Do minimal login
    await page.getByText('Sign In', { exact: true }).click();
    await page.waitForLoadState('domcontentloaded');

    const loginPageVisible = await page
      .getByText('Log in to your account')
      .isVisible()
      .catch(() => false);
    if (loginPageVisible) {
      await page
        .locator('#pf-login-username-id')
        .fill(process.env.AAP_USER_ID!);
      await page
        .locator('#pf-login-password-id')
        .fill(process.env.AAP_USER_PASS!);
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.waitForLoadState('networkidle', { timeout: 30000 });
    }
  }

  // Wait a bit for page to settle
  await page.waitForTimeout(2000);

  console.log('=== DEBUG INFO ===');
  console.log('Current URL:', page.url());

  // Check for header element
  const headerExists = await page.locator('header').count();
  console.log('Number of <header> elements:', headerExists);

  // Get all text in header
  if (headerExists > 0) {
    const headerText = await page.locator('header').first().textContent();
    console.log('Header text content:', headerText);

    // Check for navigation/nav elements
    const navExists = await page
      .locator('header nav, header [role="navigation"]')
      .count();
    console.log('Navigation elements in header:', navExists);
  }

  // Check for common navigation patterns
  const hasTemplates = await page
    .getByText('Templates')
    .isVisible()
    .catch(() => false);
  const hasTemplate = await page
    .getByText('Template')
    .isVisible()
    .catch(() => false);
  const hasCatalog = await page
    .getByText('Catalog')
    .isVisible()
    .catch(() => false);

  console.log('Has "Templates" text:', hasTemplates);
  console.log('Has "Template" text:', hasTemplate);
  console.log('Has "Catalog" text:', hasCatalog);

  // Take a screenshot for manual inspection
  await page.screenshot({ path: 'debug-after-login.png', fullPage: true });
  console.log('Screenshot saved to: debug-after-login.png');
});
