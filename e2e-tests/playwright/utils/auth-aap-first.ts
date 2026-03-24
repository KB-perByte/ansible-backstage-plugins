import { Page } from '@playwright/test';

/**
 * Alternative authentication approach:
 * Navigate to AAP OAuth URL first, then to portal
 *
 * This leverages existing AAP browser session:
 * - If user is already logged into AAP in browser → automatic OAuth redirect
 * - If not logged in → AAP login page appears, user logs in once
 *
 * This is faster because it reuses AAP browser sessions
 */
export async function loginAAPSessionFirst(page: Page) {
  console.log('[Auth] Checking AAP session...');

  // Navigate directly to AAP OAuth authorize URL
  // This is the same URL the portal redirects to when you click "Sign In"
  const aapOAuthUrl =
    `https://34.226.249.151/o/authorize/?` +
    `response_type=code&` +
    `redirect_uri=https://192.168.124.108:443/api/auth/rhaap/handler/frame&` +
    `scope=read write&` +
    `client_id=${process.env.OAUTH_CLIENT_ID}&` +
    `approval_prompt=auto`;

  await page.goto(aapOAuthUrl, { waitUntil: 'domcontentloaded' });
  console.log('[Auth] Navigated to AAP OAuth URL:', page.url());

  // Check if we hit AAP login page or got redirected back
  const onLoginPage = await page
    .getByText('Log in to your account')
    .isVisible()
    .catch(() => false);

  if (onLoginPage) {
    console.log('[Auth] AAP login required, filling credentials...');

    // Fill in AAP credentials
    await page.locator('#pf-login-username-id').fill(process.env.AAP_USER_ID!);
    await page
      .locator('#pf-login-password-id')
      .fill(process.env.AAP_USER_PASS!);

    console.log('[Auth] Clicking Log in button...');
    await page.getByRole('button', { name: 'Log in' }).click();
  } else {
    console.log('[Auth] Already logged into AAP, skipping login');
  }

  // Check for OAuth authorization prompt
  const baseUrl = new URL(process.env.BASE_URL || 'http://localhost:7007');
  const onAuthorizePage = page.url().includes('authorize');

  if (onAuthorizePage) {
    const authorizeVisible = await page
      .getByText(/Authorize.*\?/)
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (authorizeVisible) {
      console.log('[Auth] OAuth authorization required, clicking Authorize...');
      await page.getByRole('button', { name: 'Authorize' }).click();
    }
  }

  // Wait for redirect back to portal
  console.log('[Auth] Waiting for redirect to portal...');
  await page.waitForURL(url => url.hostname === baseUrl.hostname, {
    timeout: 30000,
  });

  // Wait for portal to load
  await page.waitForLoadState('networkidle');
  console.log('[Auth] Redirected to portal:', page.url());

  // Verify we're authenticated
  await page
    .getByText('Templates', { exact: true })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 });

  console.log('[Auth] Login successful ✓');
}
