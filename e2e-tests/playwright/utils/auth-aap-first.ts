import { Page } from '@playwright/test';

/** When `BASE_URL` is unset; keep in sync with `e2e-tests/.env.example`. */
const DEFAULT_BASE_URL = 'http://localhost:7071';

function stripTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(
      `[auth-aap-first] Missing required environment variable: ${name}`,
    );
  }
  return v.trim();
}

/**
 * Builds the AAP OAuth `/o/authorize/` URL used by the RHAAP auth provider.
 * Must match the portal’s registered callback:
 * `{BASE_URL}/api/auth/rhaap/handler/frame`
 *
 * Required env: `AAP_URL`, `OAUTH_CLIENT_ID`
 * Optional: `BASE_URL` (default `http://localhost:7071`), `OAUTH_SCOPE` (default `read`)
 */
export function buildAapOAuthAuthorizeUrl(): string {
  const aapBase = stripTrailingSlashes(requireEnv('AAP_URL'));
  const portalBase = stripTrailingSlashes(
    process.env.BASE_URL || DEFAULT_BASE_URL,
  );
  const clientId = requireEnv('OAUTH_CLIENT_ID');
  const scope = (process.env.OAUTH_SCOPE || 'read').trim();

  const redirectUri = `${portalBase}/api/auth/rhaap/handler/frame`;

  const authorize = new URL('/o/authorize/', `${aapBase}/`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', scope);
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('approval_prompt', 'auto');

  return authorize.href;
}

/**
 * Alternative authentication approach:
 * Navigate to AAP OAuth URL first, then to portal
 *
 * This leverages existing AAP browser session:
 * - If user is already logged into AAP in browser → automatic OAuth redirect
 * - If not logged in → AAP login page appears, user logs in once
 *
 * Required env: `AAP_URL`, `OAUTH_CLIENT_ID`, `AAP_USER_ID`, `AAP_USER_PASS`
 * (same `clientId` as `auth.providers.rhaap.development.clientId` in app-config)
 */
export async function loginAAPSessionFirst(page: Page) {
  console.log('[Auth] Checking AAP session...');

  const aapOAuthUrl = buildAapOAuthAuthorizeUrl();

  await page.goto(aapOAuthUrl, { waitUntil: 'domcontentloaded' });
  console.log('[Auth] Navigated to AAP OAuth URL:', page.url());

  // Check if we hit AAP login page or got redirected back
  const onLoginPage = await page
    .getByText('Log in to your account')
    .isVisible()
    .catch(() => false);

  if (onLoginPage) {
    console.log('[Auth] AAP login required, filling credentials...');

    await page.locator('#pf-login-username-id').fill(process.env.AAP_USER_ID!);
    await page
      .locator('#pf-login-password-id')
      .fill(process.env.AAP_USER_PASS!);

    console.log('[Auth] Clicking Log in button...');
    await page.getByRole('button', { name: 'Log in' }).click();
  } else {
    console.log('[Auth] Already logged into AAP, skipping login');
  }

  // Check for OAuth authorization prompt on AAP
  const baseUrl = new URL(process.env.BASE_URL || DEFAULT_BASE_URL);
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

  await page.waitForLoadState('networkidle');
  console.log('[Auth] Redirected to portal:', page.url());

  const backstageAuthorizeVisible = await page
    .getByText('Authorize Ansible Automation Experience App')
    .isVisible()
    .catch(() => false);

  if (backstageAuthorizeVisible) {
    console.log(
      '[Auth] Backstage authorization page detected, clicking Authorize...',
    );
    await page.getByRole('button', { name: 'Authorize' }).click();
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    console.log('[Auth] After Backstage authorize, URL:', page.url());
  }

  const signInPromptVisible = await page
    .getByText('Select a Sign-in method')
    .isVisible()
    .catch(() => false);

  const url = page.url();
  const onSelfService = url.includes('/self-service');
  const mainVisible = await page
    .locator('main')
    .isVisible()
    .catch(() => false);

  if (onSelfService && mainVisible && !signInPromptVisible) {
    console.log('[Auth] Login successful ✓');
    return;
  }

  const hasTemplatesNav = await page
    .getByText('Templates', { exact: true })
    .first()
    .isVisible()
    .catch(() => false);

  if (hasTemplatesNav) {
    console.log('[Auth] Login successful ✓');
    return;
  }

  const templatesOrShell = page
    .getByText('Templates', { exact: true })
    .first()
    .or(page.getByRole('link', { name: /templates/i }))
    .or(page.locator('[href*="/self-service"]'))
    .first();

  await templatesOrShell.waitFor({ state: 'visible', timeout: 20000 });

  console.log('[Auth] Login successful ✓');
}
