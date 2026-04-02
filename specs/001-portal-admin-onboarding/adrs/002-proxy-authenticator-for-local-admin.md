# ADR-002: ProxyAuthenticator for Local Admin Auth

**Status**: Accepted
**Date**: 2026-03-30
**Deciders**: Portal team

## Context

The portal needs a local admin login for initial setup and emergency recovery when AAP OAuth is unavailable. Two implementation approaches were built:

1. **Custom Express router** (`localAdmin.ts`): A standalone `POST /local-login` endpoint with manual rate limiting, password validation, audit logging, and token issuance
2. **Backstage ProxyAuthenticator** (`localAdminAuthenticator.ts`): Uses `createProxyAuthenticator()` to plug into Backstage's standard auth provider framework, delegating token issuance and session management to Backstage

## Alternatives Considered

### Option 1: Custom Express Router with `/local-login` Endpoint (Rejected)

A standalone Express router (`localAdmin.ts`) implementing `POST /api/auth/rhaap/local-login` with hand-written rate limiting (5 attempts/min per IP), bcrypt validation, audit logging, and manual Backstage token issuance via an `issueToken()` callback.

**Why rejected:**

- **Token issuance is fragile**: Manually constructing Backstage identity tokens requires understanding the internal claims format (`sub`, `ent`), signing key management, and token type headers. Getting any of these wrong produces tokens that Backstage's `IdentityApi` silently rejects
- **No session management**: The custom endpoint returns a one-shot token. There's no refresh mechanism — the frontend would need to re-authenticate with username/password on every token expiry (every 60 minutes). The ProxyAuthenticator gets refresh for free via Backstage's auth framework
- **Duplicated security logic**: Rate limiting, IP extraction, audit logging — all hand-written. Backstage's auth framework provides middleware hooks for these concerns; reimplementing them is error-prone
- **Frontend complexity**: Would require a custom login form component that POSTs to `/local-login` and manually stores the token. The ProxyAuthenticator works with Backstage's built-in `ProxiedSignInPage` — zero custom frontend auth code

### Option 2: Separate Auth Backend Module (Rejected)

Create a new package `auth-backend-module-local-admin-provider` as a standalone Backstage auth module.

**Why rejected:**

- Local admin is not a separate identity provider — it's an alternate mode of the same portal auth. Creating a separate package implies it has independent lifecycle, configuration, and deployment, which is misleading
- Adds another package to build, test, version, and deploy as a dynamic plugin
- The existing `auth-backend-module-rhaap-provider` already manages the portal's auth providers. Adding local-admin as a second provider within the same module is natural — both `rhaap` (OAuth) and `local-admin` (proxy) are registered in the same `init()` call

### Option 3: Backstage Guest Provider (Rejected)

Use Backstage's built-in guest auth provider for setup mode.

**Why rejected:**

- Guest provider creates `user:development/guest` identity — not `user:default/admin`. The admin identity needs specific RBAC permissions that guest doesn't have
- Guest provider has no password protection at all — anyone can authenticate. Our local-admin at least validates against a configured password when credentials are explicitly provided
- Guest provider is being deprecated in Backstage. Relying on it for a production feature (emergency recovery) is a risk

## Decision

Use the **ProxyAuthenticator pattern** (`localAdminAuthenticator.ts`) and remove the custom Express router (`localAdmin.ts`).

**Why this approach wins:**

- Backstage's `TokenFactory` handles all JWT complexity — signing keys, claims format, token type, expiry. We just return a `result` object and the framework does the rest
- `ProxiedSignInPage` provides auto-login during setup mode with zero custom frontend code — the same UX pattern as the guest provider but with password protection
- Token refresh works automatically — Backstage's auth framework handles the `/refresh` endpoint, cookie management, and token rotation
- The `signInResolver` handles both catalog-backed users (`signInWithCatalogUser`) and standalone mode (direct `issueToken`) — works whether or not the `user:default/admin` entity exists in the catalog

### Auth Flow: Three Sign-In Modes

```
                         Browser opens portal
                                │
                                ▼
                    ┌───────────────────────┐
                    │  GET /setup/status    │
                    │  (public, no auth)    │
                    └───────────┬───────────┘
                                │
               ┌────────────────┼────────────────┐
               │                │                │
        setupComplete      setupComplete    localAdmin
        = false            = true           Enabled
        localAdmin         localAdmin       = false
        Enabled=true       Enabled=true          │
               │                │                │
               ▼                ▼                ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │  MODE 1:     │  │  MODE 2:     │  │  MODE 3:     │
     │  Auto-login  │  │  Dual        │  │  AAP Only    │
     │              │  │              │  │              │
     │ ProxiedSign  │  │ ┌──────────┐ │  │ Auto-        │
     │ InPage       │  │ │Local     │ │  │ redirect     │
     │ (no password │  │ │Admin     │ │  │ to AAP       │
     │  prompt)     │  │ │(password)│ │  │ OAuth        │
     │              │  │ └──────────┘ │  │              │
     │ → Setup      │  │ ┌──────────┐ │  └──────┬───────┘
     │   Wizard     │  │ │AAP OAuth │ │         │
     └──────┬───────┘  │ │(button)  │ │         ▼
            │          │ └──────────┘ │  ┌──────────────┐
            ▼          └──────┬───────┘  │ AAP OAuth    │
     ┌──────────────┐         │          │ → callback   │
     │ /self-service │         ▼          │ → JWT        │
     │ /setup        │  Admin chooses     └──────────────┘
     └──────────────┘  and enters
       First boot      password
                          │
                          ▼
                   Emergency recovery
                   or admin tasks
```

**Why three modes instead of two:**
- Mode 1 (auto-login) is needed for first boot — no password prompt so the admin gets straight into the wizard
- Mode 2 (dual) is needed post-setup — the admin must enter a password to prove they're the admin (not just anyone who can reach the portal). Without this, enabling local admin would make logout impossible (ProxiedSignInPage auto-re-authenticates immediately)
- Mode 3 (AAP only) is the normal operational mode

### Password Validation

```
  Credential check (when explicitly provided)
  ────────────────────────────────────────────

  username === "admin"?  ── no ──► AuthenticationError
         │
        yes
         │
         ▼
  ┌──────────────────────────────────────────────────┐
  │ PORTAL_ADMIN_PASSWORD_HASH env var set?          │
  │                                                  │
  │  yes ──► bcrypt.compare(password, hash)          │
  │          (production: K8s secret / Podman secret)│
  │                                                  │
  │  no ───► SHA-256 timing-safe compare             │
  │          against config or env var               │
  │          (local dev: plain text password)         │
  └──────────────────────────────────────────────────┘
```

## Consequences

**Positive:**

- Backstage's `TokenFactory` issues proper signed JWTs (ES256, type: `vnd.backstage.user`) — no custom token logic
- Frontend can use `ProxiedSignInPage` for auto-login during setup mode, avoiding a custom login form for initial setup
- Session refresh, token rotation, and cookie management handled by Backstage's auth framework
- Simpler code — no manual Express route, rate limiting, or audit logging needed

**Negative:**

- Auto-authenticate on refresh (no credentials) means anyone with network access to the backend can get an admin token while the `local-admin` provider is registered. Mitigated by:
  - Provider is only registered when a password is configured
  - `localAdminEnabled` is set to `false` after setup completes
  - Auto-authentication (ProxiedSignInPage) only used during initial setup (`setupComplete=false`). Post-setup dual mode uses `LocalAdminLoginCard` which requires explicit password entry
  - Local admin toggle is CLI/API-only (General page removed) — can't be casually enabled from the UI
- Lost the rate limiting and audit logging from the custom router. Could be re-added via Backstage auth hooks if needed

**Design evolution**: The original implementation had two sign-in modes (auto-login vs AAP OAuth). Testing revealed that enabling local admin post-setup made logout impossible (ProxiedSignInPage auto-re-authenticated). Fixed by adding a third "dual mode" where local admin requires explicit password entry. The General page toggle was also removed — local admin is now enabled only via CLI (`yarn portal-admin set-local-admin`, `portal-config set LOCAL_ADMIN_ENABLED`, or API), following the enterprise pattern where break-glass access is an infrastructure operation.

## Related

- `plugins/auth-backend-module-rhaap-provider/src/localAdminAuthenticator.ts`
- `plugins/auth-backend-module-rhaap-provider/src/module.ts` (provider registration)
- `plugins/self-service/src/components/SignInPage/SignInPage.tsx` (three-mode sign-in)
- `plugins/self-service/src/components/SignInPage/LocalAdminLoginCard.tsx` (password form for dual mode)
