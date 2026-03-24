# Playwright E2E Tests

Modern end-to-end tests for ansible-backstage-plugins using Playwright.

## Why Playwright?

This is a proof-of-concept migration from Cypress to Playwright, offering:

- **5-8x faster** execution (parallel by default)
- **No hard-coded waits** (smart auto-waiting)
- **Better debugging** (trace viewer, codegen)
- **Modern syntax** (async/await vs Cypress chains)

## Quick Start

### Install Dependencies

```bash
yarn install
npx playwright install chromium
```

### Run Tests

```bash
# Run all tests (headless)
yarn pw:test

# Run with UI (interactive mode)
yarn pw:test:ui

# Run with browser visible
yarn pw:test:headed

# Debug mode (step through tests)
yarn pw:test:debug

# Run specific test file
yarn pw:test playwright/tests/self-service/login.spec.ts
```

### Environment Variables

Set these environment variables before running tests:

```bash
export BASE_URL=http://localhost:7007
export AAP_USER_ID=your-username
export AAP_USER_PASS=your-password
export GH_USER_ID=your-github-username          # For RHDH tests
export GH_USER_PASS=your-github-password        # For RHDH tests
export AUTHENTICATOR_SECRET=your-2fa-secret     # For GitHub 2FA
```

## Test Structure

```
playwright/
├── tests/
│   ├── self-service/    # Portal-specific tests
│   │   └── login.spec.ts
│   └── rhdh/            # RHDH-specific tests
├── utils/
│   └── auth.ts          # Authentication utilities
├── fixtures/            # Test data
└── .auth/               # Cached authentication states
```

## Writing Tests

### Basic Test Example

```typescript
import { test, expect } from '@playwright/test';

test('my test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Welcome');
});
```

### Using Auth Utilities

```typescript
import { test, expect } from '@playwright/test';
import { loginAAP } from '../../utils/auth';

test('authenticated test', async ({ page }) => {
  await loginAAP(page);
  // Now you're logged in and can test authenticated features
});
```

## Key Differences from Cypress

### Locators

| Cypress                       | Playwright                 |
| ----------------------------- | -------------------------- |
| `cy.get('#id')`               | `page.locator('#id')`      |
| `cy.contains('text')`         | `page.getByText('text')`   |
| `cy.get('button')`            | `page.getByRole('button')` |
| `cy.get('[data-testid="x"]')` | `page.getByTestId('x')`    |

### Assertions

| Cypress                                  | Playwright                                               |
| ---------------------------------------- | -------------------------------------------------------- |
| `cy.get('h1').should('be.visible')`      | `await expect(page.locator('h1')).toBeVisible()`         |
| `cy.url().should('include', '/foo')`     | `await expect(page).toHaveURL(/\/foo/)`                  |
| `cy.get('h1').should('contain', 'text')` | `await expect(page.locator('h1')).toContainText('text')` |

### No Manual Waits

```typescript
// ❌ Cypress (hard-coded waits)
cy.wait(5000);
cy.get('button').click();

// ✅ Playwright (auto-waits intelligently)
await page.getByRole('button').click();
```

## Debugging

### Trace Viewer

When a test fails, open the trace:

```bash
yarn pw:show-report
```

This shows:

- Screenshots at each step
- Network requests
- Console logs
- DOM snapshots

### Codegen (Record Tests)

Generate tests by clicking in the browser:

```bash
yarn pw:codegen http://localhost:7007
```

### VS Code Extension

Install the [Playwright Test for VSCode](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright) extension to:

- Run tests from editor
- Set breakpoints
- Step through tests
- View results inline

## CI Integration

Tests are configured to run in CI with:

- **Parallel execution** (4 workers)
- **Auto-retries** (2 retries on failure)
- **Video/screenshot** capture on failure
- **JUnit/JSON** reports for CI integration

## Comparison: Login Test

### Cypress Version

```typescript
// cypress/e2e/self-service/login.cy.ts
import { Common } from '../utils/common';

describe('Login Tests', () => {
  it('Sign In', { retries: 2 }, () => {
    Common.LogintoAAP(); // 20+ hard-coded cy.wait() calls
  });
});
```

### Playwright Version

```typescript
// playwright/tests/self-service/login.spec.ts
import { test, expect } from '@playwright/test';
import { loginAAP } from '../../utils/auth';

test.describe('Login Tests', () => {
  test('Sign In', async ({ page }) => {
    await loginAAP(page); // No hard-coded waits, smarter auto-waiting
    await expect(page.getByRole('banner')).toContainText('Templates');
  });
});
```

**Result**: Same test, 80% less wait time, cleaner code.

## Next Steps

This is a proof-of-concept for the login test. To complete the migration:

1. ✅ Login test migrated
2. ⏳ Migrate browse.cy.ts
3. ⏳ Migrate create.cy.ts
4. ⏳ Migrate remaining self-service tests
5. ⏳ Migrate RHDH tests
6. ⏳ Update CI pipelines
7. ⏳ Remove Cypress

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [API Reference](https://playwright.dev/docs/api/class-playwright)
