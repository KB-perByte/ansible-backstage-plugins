import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

dotenv.config();

/**
 * Script to manually login and save auth state
 * Run with: npx ts-node playwright/scripts/manual-login.ts
 *
 * This opens a browser where you can:
 * 1. Login to AAP manually
 * 2. Complete OAuth flow
 * 3. Press Enter to save the auth state
 */
async function manualLogin() {
  // Use canonical BASE_URL (same as playwright.config.ts)
  const baseURL = process.env.BASE_URL || 'http://localhost:7071';

  const browser = await chromium.launch({
    headless: false, // Open visible browser
    slowMo: 100,
  });

  try {
    const context = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    console.log('\n=== MANUAL LOGIN HELPER ===');
    console.log(`Using BASE_URL: ${baseURL}`);
    console.log('1. Navigate to the portal and login manually');
    console.log('2. Complete the OAuth flow');
    console.log('3. Verify you see the Templates navigation');
    console.log('4. Press ENTER in this terminal to save the auth state\n');

    // Navigate to home page
    await page.goto('/');

    // Wait for user to complete manual login
    await new Promise<void>(resolve => {
      process.stdin.once('data', () => {
        console.log('\n✓ Saving authentication state...');
        resolve();
      });
    });

    // Save storage state
    const authFile = 'playwright/.auth/user.json';

    // Ensure directory exists
    mkdirSync(dirname(authFile), { recursive: true });

    await context.storageState({ path: authFile });
    console.log('✓ Authentication state saved to:', authFile);

    // Verify saved state
    const savedState = await context.storageState();
    console.log('\n=== Saved State Summary ===');
    console.log('Cookies:', savedState.cookies.length);
    console.log(
      'LocalStorage items:',
      savedState.origins[0]?.localStorage?.length || 0,
    );

    console.log(
      '\n✓ Done! You can now run tests with this authenticated state.',
    );
  } finally {
    await browser.close();
  }
}

// Run with proper error handling
manualLogin().catch(error => {
  console.error('Manual login failed:', error);
  process.exit(1);
});
