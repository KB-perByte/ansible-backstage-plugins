import { Page } from '@playwright/test';
import { authenticator } from 'otplib';

/**
 * Authentication utilities for Playwright E2E tests
 * Migrated from Cypress common.ts with improvements
 */

/**
 * Login to AAP portal
 * Replaces the Cypress Common.LogintoAAP() with smarter auto-waiting
 */
export async function loginAAP(page: Page) {
  console.log('[Auth] Starting login process...');

  // Navigate to home page
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  console.log('[Auth] Navigated to home page:', page.url());

  // Wait for main content to load
  await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });

  // Check if we need to sign in
  const signInMethodVisible = await page
    .getByText('Select a Sign-in method')
    .isVisible()
    .catch(() => false);

  if (!signInMethodVisible) {
    console.log(
      '[Auth] Already logged in, checking for Templates navigation...',
    );
    // Verify we're actually logged in
    const hasTemplates = await page
      .getByText('Templates', { exact: true })
      .first()
      .isVisible()
      .catch(() => false);

    if (hasTemplates) {
      console.log('[Auth] Already authenticated ✓');
      return;
    } else {
      console.log('[Auth] Not on login page but not authenticated either');
    }
  }

  console.log('[Auth] Clicking Sign In button...');
  // Click Sign In - use getByText instead of getByRole to match Cypress behavior
  const signInButton = page.getByText('Sign In', { exact: true });
  await signInButton.click();

  // Wait a moment for navigation (like Cypress wait)
  await page.waitForLoadState('domcontentloaded');
  console.log('[Auth] After Sign In click, URL:', page.url());

  // Wait for AAP login page to load
  const loginPageVisible = await page
    .getByText('Log in to your account')
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (loginPageVisible) {
    console.log('[Auth] AAP login page loaded, filling credentials...');

    // Fill in credentials
    await page.locator('#pf-login-username-id').fill(process.env.AAP_USER_ID!);
    await page
      .locator('#pf-login-password-id')
      .fill(process.env.AAP_USER_PASS!);

    // Optional: Toggle password visibility (like Cypress test does)
    const showPasswordButton = page.getByLabel('Show password');
    if (await showPasswordButton.isVisible().catch(() => false)) {
      await showPasswordButton.click();
      await page.getByLabel('Hide password').click();
    }

    console.log('[Auth] Clicking Log in button...');
    // Click login button
    await page.getByRole('button', { name: 'Log in' }).click();

    // Wait a moment for navigation
    await page.waitForLoadState('domcontentloaded');
    console.log('[Auth] After Log in click, URL:', page.url());

    // Check for AAP OAuth authorization page
    const aapAuthorizeVisible = await page
      .getByText(/Authorize.*\?/)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (aapAuthorizeVisible) {
      console.log(
        '[Auth] AAP OAuth authorization page detected, clicking Authorize...',
      );
      await page.getByRole('button', { name: 'Authorize' }).click();
      console.log('[Auth] Clicked Authorize button');
    }

    // Wait for OAuth redirect back to portal - match actual hostname, not query params
    console.log('[Auth] Waiting for OAuth callback redirect...');
    const baseUrl = new URL(process.env.BASE_URL || 'http://localhost:7007');
    await page.waitForURL(url => url.hostname === baseUrl.hostname, {
      timeout: 30000,
    });
    console.log('[Auth] After login redirect, URL:', page.url());

    // Wait for page to fully load after OAuth callback
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Check for Backstage authorization page (different from AAP auth)
    await page.waitForTimeout(1000);

    const authorizeVisible = await page
      .getByText('Authorize Ansible Automation Experience App')
      .isVisible()
      .catch(() => false);

    if (authorizeVisible) {
      console.log(
        '[Auth] Backstage authorization page detected, clicking Authorize...',
      );
      await page.getByRole('button', { name: 'Authorize' }).click();
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      console.log('[Auth] After Backstage authorize, URL:', page.url());
    }
  }

  // Wait for page to settle after auth flow
  await page.waitForTimeout(1000);

  console.log('[Auth] Current URL after auth:', page.url());

  // Check if we're already on an authenticated page (like /self-service/catalog)
  // If so, Templates navigation should already be visible
  const hasTemplatesAlready = await page
    .getByText('Templates', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);

  if (hasTemplatesAlready) {
    console.log(
      '[Auth] Already on authenticated page with Templates navigation ✓',
    );
    return;
  }

  // If not, navigate to home and verify
  console.log('[Auth] Navigating to home to verify authentication...');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  console.log('[Auth] Final URL:', page.url());

  // Verify successful login - wait for Templates navigation
  console.log('[Auth] Waiting for Templates navigation...');
  await page
    .getByText('Templates', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 });

  console.log('[Auth] Login successful ✓');
}

/**
 * Login to AAP with session caching
 * Similar to Cypress cy.session() but with Playwright's storage state
 */
export async function loginAAPWithSession(page: Page) {
  const storageStatePath = 'playwright/.auth/user.json';

  // Try to use existing session
  try {
    // Check if session file exists and load it
    await page.context().storageState({ path: storageStatePath });

    // Verify session is still valid
    await page.goto('/');
    const isLoggedIn = await page
      .getByRole('banner')
      .getByText('Templates')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (isLoggedIn) {
      // Session is valid, no need to login
      return;
    }
  } catch {
    // Session doesn't exist or is invalid, continue with login
  }

  // Perform login
  await loginAAP(page);

  // Save session state for reuse
  await page.context().storageState({ path: storageStatePath });
}

/**
 * Login to GitHub with 2FA
 * Migrated from Cypress Common.LogintoGithub()
 */
export async function loginGitHub(page: Page) {
  await page.goto('https://github.com/login');

  // Wait for sign in form
  await page.getByText('Sign in').waitFor();

  // Fill credentials
  await page.locator('#login_field').fill(process.env.GH_USER_ID!);
  await page.locator('#password').fill(process.env.GH_USER_PASS!);

  // Click sign in
  await page.getByRole('button', { value: 'Sign in' }).click();

  // Handle 2FA if required
  const totpFieldVisible = await page
    .locator('#app_totp')
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (totpFieldVisible) {
    const totp = authenticator.generate(process.env.AUTHENTICATOR_SECRET!);
    await page.locator('#app_totp').fill(totp);
  }
}

/**
 * Sign in to RHDH using GitHub authentication
 * Migrated from Cypress Common.SignIntoRHDHusingGithub()
 */
export async function signInRHDHWithGitHub(page: Page) {
  // First login to GitHub
  await loginGitHub(page);

  // Navigate to RHDH home
  await page.goto('/');

  // Check if sign in is needed
  const signInVisible = await page
    .getByRole('button', { name: 'Sign In' })
    .isVisible()
    .catch(() => false);

  if (signInVisible) {
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Handle GitHub authorization if prompted
    const authorizeVisible = await page
      .getByRole('button', { name: 'Authorize' })
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (authorizeVisible) {
      await page.getByRole('button', { name: 'Authorize' }).click();
    }

    // Click Ansible link
    await page.getByText('Ansible').click();

    // Verify navigation to /ansible
    await page.waitForURL(/\/ansible/);
  }
}
