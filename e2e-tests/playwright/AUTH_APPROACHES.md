# Playwright Authentication Approaches - Deep Dive

## Summary

After extensive testing, we found **the shared browser context approach** is the most effective for OAuth-based authentication.

## Approaches Tested

### 1. ❌ Storage State (Global Setup)

**Concept:** Login once in global setup, save cookies/localStorage, load in each test

**Implementation:**

```typescript
// playwright/global-setup.ts
await loginAAP(page);
await context.storageState({ path: 'playwright/.auth/user.json' });

// playwright.config.ts
projects: [
  {
    use: { storageState: 'playwright/.auth/user.json' },
  },
];
```

**Result:** FAILED ❌
**Why:** Each test creates a NEW browser context. Even though cookies/localStorage are restored, the OAuth session isn't recognized. The portal redirects back to login page.

**Key Insight:** OAuth sessions require more than just cookies - they need the actual browser session/context to remain alive.

---

### 2. ❌ Setup Project with Dependencies

**Concept:** Run a setup test first, save auth state, other tests depend on it

**Implementation:**

```typescript
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    dependencies: ['setup'],
    use: { storageState: 'playwright/.auth/user.json' },
  },
];
```

**Result:** FAILED ❌
**Why:** Same issue as approach #1 - storage state doesn't preserve OAuth session across NEW contexts.

---

### 3. ✅ Shared Browser Context (Worker-Scoped Fixture)

**Concept:** Create ONE persistent browser context for all tests in a worker. Browser stays open, session preserved.

**Implementation:**

```typescript
// playwright/fixtures/auth-context.ts
let sharedContext: BrowserContext | null = null;

export const test = base.extend<{ authenticatedContext: BrowserContext }>({
  authenticatedContext: [async ({ browser }, use) => {
    if (!sharedContext) {
      sharedContext = await browser.newContext({...});
      const loginPage = await sharedContext.newPage();
      await loginAAP(loginPage);  // Login once!
      await loginPage.close();
    }
    await use(sharedContext);  // Don't close - keep alive!
  }, { scope: 'worker' }],

  page: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();  // Fresh page, same context
    await use(page);
    await page.close();
  },
});
```

**Configuration:**

```typescript
// playwright.config.ts
workers: 1,  // Single worker to share context
fullyParallel: false,
```

**Result:** SUCCESS ✅
**Why:**

- Browser context stays open for the entire test run
- OAuth session remains valid
- Each test gets a fresh PAGE but in the SAME authenticated CONTEXT
- Session cookies/tokens remain active

**Performance:**

- Login: 1 time (vs 3 times before)
- Total time: 57.9s (vs 84s with individual logins)
- Savings: ~30% faster

---

### 4. 🚀 Manual Login + Persistent Context (Proposed)

**Concept:** User logs in manually once in browser, save that state, reuse forever

**Implementation:**

```bash
# One-time setup
npx ts-node playwright/scripts/manual-login.ts
# Opens browser, user logs in, press ENTER to save state
```

**Advantages:**

- User only logs in ONCE ever (not once per test run)
- Can leverage existing browser sessions
- Useful for development/debugging

**Use Cases:**

- Local development
- Long-running test suites
- When AAP session lasts days/weeks

**Status:** Implemented but not yet tested

---

### 5. 🔄 AAP-First OAuth Flow (Alternative)

**Concept:** Navigate directly to AAP OAuth URL instead of going through portal

**Theory:**

- If user is already logged into AAP in browser → instant OAuth redirect
- If not → AAP login page appears, but only ONCE

**Implementation:**

```typescript
// Navigate directly to AAP OAuth authorize URL
const aapOAuthUrl = `https://34.226.249.151/o/authorize/?...`;
await page.goto(aapOAuthUrl);

// If already logged into AAP → automatic redirect back to portal
// If not → show AAP login, then redirect
```

**Advantages:**

- Could leverage existing AAP browser sessions
- Skips "Click Sign In" step
- More direct OAuth flow

**Status:** Implemented but not fully tested

---

## Final Recommendation

**Use Approach #3: Shared Browser Context**

**Why:**

1. ✅ Works reliably with OAuth
2. ✅ Fast - login once per test run
3. ✅ No manual intervention needed
4. ✅ Session persists across all tests
5. ✅ Each test is still isolated (fresh page)

**Trade-offs:**

- Must use `workers: 1` (no parallel workers)
- But tests within the worker can still run serially without re-login
- For larger test suites, consider organizing into multiple files that CAN run in parallel

---

## Key Learnings

### Why Storage State Fails for OAuth

1. **New Context = New Session:** Each `browser.newContext()` creates a fresh browser session
2. **Cookies Aren't Enough:** OAuth relies on browser session state beyond just cookies
3. **Token Validation:** OAuth tokens may be tied to the browser context/session ID

### Why Shared Context Works

1. **Same Context = Same Session:** All tests use ONE `BrowserContext` instance
2. **Fresh Pages, Not Contexts:** Each test gets `newPage()` but in same context
3. **Session Stays Alive:** OAuth session remains valid throughout test run

### The Critical Difference

```typescript
// ❌ Each test gets NEW context (storage state approach)
test('my test', async ({ page }) => {
  // page.context() is a brand new BrowserContext
  // Even with saved cookies, OAuth session is lost
});

// ✅ All tests share ONE context (fixture approach)
test('my test', async ({ page }) => {
  // page.context() is the SAME BrowserContext for all tests
  // OAuth session stays alive!
});
```

---

## Future Optimizations

### For Large Test Suites

1. **Separate by auth requirements:**
   - Public tests (no auth) → Run in parallel
   - Authenticated tests → Run in one worker with shared context

2. **Multiple workers with different auth:**

   ```typescript
   projects: [
     { name: 'admin', use: { ...adminAuth }, workers: 1 },
     { name: 'viewer', use: { ...viewerAuth }, workers: 1 },
   ];
   ```

3. **Hybrid approach:**
   - Fast tests with shared context (in CI)
   - Manual login for local development

---

## Commands

```bash
# Run with shared context (current approach)
npx playwright test

# Manual login helper (for development)
npx ts-node playwright/scripts/manual-login.ts

# Debug specific test
npx playwright test --debug login.spec.ts
```
