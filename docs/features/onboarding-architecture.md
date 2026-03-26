# Onboarding Architecture

How the portal setup and onboarding experience works across all deployment modes.

## Overview

The Ansible Self-Service Portal includes a day-0 setup wizard that guides administrators through configuring AAP connections, content registries, and SCM providers. Configuration entered in the UI is stored in the portal database and loaded at startup via a custom `DatabaseConfigSource` that merges DB values with static `app-config.yaml`.

## Architecture

```
┌─────────────────────┐
│  app-config.yaml    │ ← Static config (Helm/bootc/local)
│  (placeholders)     │
└────────┬────────────┘
         │ merged (DB overrides static)
┌────────▼────────────┐
│  DatabaseConfigSource│ ← Reads portal_config table at startup
│  (portal_config DB) │
└────────┬────────────┘
         │
┌────────▼────────────┐
│  Backstage Config   │ ← All plugins see merged config
│  (rootConfig)       │   Community plugins work unchanged
└─────────────────────┘
```

## Authentication Modes

The sign-in page has two modes controlled by `localAdminEnabled` in the database:

| Mode | When | What Shows | How It Works |
|------|------|-----------|-------------|
| **Setup** | `localAdminEnabled=true` (fresh install) | Auto-login via `ProxiedSignInPage` | `local-admin` ProxyAuthenticator issues Backstage user JWT for `user:default/admin` |
| **Normal** | `localAdminEnabled=false` (after setup) | AAP OAuth login | Standard OAuth redirect to AAP, auto-redirect with `auto` flag |

The `local-admin` provider:
- Uses Backstage's `createProxyAuthenticator` pattern
- Issues proper user JWTs (`vnd.backstage.user`, ES256 signed)
- Auto-authenticates on GET `/refresh` (like guest provider) for token lifecycle
- Validates password when credentials are explicitly provided via headers
- Password source: `PORTAL_ADMIN_PASSWORD` env var or `auth.providers.local-admin.<env>.password` config

## Setup Flow

```
1. Portal boots with onboarding.enabled=true
2. Sign-in page detects localAdminEnabled=true → ProxiedSignInPage auto-login
3. RootRedirect detects setupComplete=false → redirects to /self-service/setup
4. Admin completes 5-step wizard:
   Step 1: Overview & Prerequisites
   Step 2: Connect AAP (URL, PAT, OAuth Client ID/Secret)
   Step 3: Connect Registries (PAH, Certified, Validated, Galaxy)
   Step 4: Connect Source Control (GitHub/GitLab — optional)
   Step 5: Review & Apply
5. "Apply & Restart Portal" saves config to DB, sets setupComplete=true, localAdminEnabled=false
6. Portal restarts → DatabaseConfigSource reads AAP config from DB
7. Sign-in page detects localAdminEnabled=false → shows AAP OAuth only
8. Admin logs in with AAP credentials
```

## Deployment-Specific Details

### Local Development

**Start in setup mode:**
```bash
PORTAL_ADMIN_PASSWORD=admin123 yarn start
```

**Reset to setup mode:**
```bash
rm -rf packages/backend/portal-dev-db && PORTAL_ADMIN_PASSWORD=admin123 yarn start
```

**How it works:**
- Database: SQLite files in `packages/backend/portal-dev-db/`
- Config override: `createRootConfigWithDatabaseSource()` registered in `packages/backend/src/index.ts`
- Bootstrap connection: Reads `app-config.yaml` + `app-config.local.yaml` directly to find DB path
- Auth environment: `development` (from `auth.environment` in config)
- Admin password: `PORTAL_ADMIN_PASSWORD` env var (plain text, no bcrypt)

**Key files:**
- `app-config.local.yaml` — Local overrides (onboarding.enabled, admin password, DB directory)
- `packages/backend/src/index.ts` — Registers `createRootConfigWithDatabaseSource()` and auth modules
- `plugins/backstage-rhaap-backend/src/config/rootConfigOverride.ts` — Merges DB config with static config
- `plugins/backstage-rhaap-backend/src/config/bootstrapConnection.ts` — Creates standalone Knex connection

### OpenShift (Helm Chart)

**Install:**
```bash
helm install portal ./ansible-portal-chart
```

**How it works:**
- Database: PostgreSQL (in-cluster or external)
- Config override: `ENABLE_CORE_ROOTCONFIG_OVERRIDE=true` env var allows rootConfig service override
- Admin password: Auto-generated at install, stored in K8s Secret `<release>-admin-credentials`
- Retrieve password: `kubectl get secret <release>-admin-credentials -o jsonpath='{.data.password}' | base64 -d`
- Restart mechanism: K8s API rollout restart (ServiceAccount has RBAC to PATCH own Deployment)
- Onboarding flag: `ansible.portal.onboarding.enabled: true` in Helm values

**Key Helm templates:**
- `templates/admin-credentials.yaml` — Pre-install hook generates admin password + bcrypt hash
- `templates/restart-rbac.yaml` — Role/RoleBinding for rollout restart
- `templates/NOTES.txt` — Displays admin password retrieval command
- `values.yaml` — `PORTAL_ADMIN_PASSWORD_HASH` env var from Secret, `DEPLOYMENT_NAME` for restart

**Recovery:**
```bash
# Enable local admin when AAP is down
kubectl exec deploy/rhaap-portal -- \
  node -e "require('knex')({client:'pg',connection:{...}}).raw('UPDATE portal_setup SET local_admin_enabled = true').then(() => process.exit(0))"
kubectl rollout restart deploy/rhaap-portal
```

### RHEL Appliance (Bootc/Quadlet)

**Boot sequence:**
```
1. VM boots → systemd starts services
2. portal-setup.py (TUI) → Infra config: ports, DB, SSL, backup
   → Generates PORTAL_ADMIN_PASSWORD_HASH as Podman secret
3. portal.service starts → RHDH + plugins loaded
4. Admin visits https://<host>:443 → Setup wizard (onboarding.enabled: true)
5. Admin configures AAP, registries, SCM → "Apply & Restart Portal"
6. portal.service restarts (process.exit(0) → systemd Restart=always)
7. DatabaseConfigSource loads config from PostgreSQL
8. AAP OAuth active → Admin logs in with AAP credentials
```

**How it works:**
- Database: PostgreSQL (local Podman container)
- Admin password: Generated by `portal-setup.py`, stored as Podman secret `portal_admin_password_hash`
- Container env: `Secret=portal_admin_password_hash,type=env,target=PORTAL_ADMIN_PASSWORD_HASH`
- Restart: Graceful `process.exit(0)` → systemd `Restart=always` restarts container
- Onboarding flag: `ansible.portal.onboarding.enabled: true` in bootc app-config.yaml

**Key bootc files:**
- `configs/app-config/app-config.yaml` — Portal config with onboarding enabled
- `configs/dynamic-plugins/dynamic-plugins.override.yaml` — Plugin loading config
- `containers/portal.container` — Quadlet with secrets and env vars
- `scripts/portal-config.sh` — Day-2 config management CLI

**Recovery:**
```bash
sudo portal-config set LOCAL_ADMIN_ENABLED=true
sudo systemctl restart portal.service
```

## Database Schema

```sql
-- Setup state (singleton row)
portal_setup:
  id: 1
  setup_complete: boolean (false → true after wizard)
  local_admin_enabled: boolean (true → false after wizard)

-- Configuration key-value store
portal_config:
  config_key: text (e.g., 'aap.controller_url')
  config_value: text (encrypted for secrets: 'enc:v1:...')
  is_secret: boolean
  category: text ('aap', 'registries', 'scm_github', 'scm_gitlab')
```

## Config Tree Builder

The `configTreeBuilder` transforms flat DB rows into nested Backstage config:

```
DB: { key: 'aap.controller_url', value: 'https://aap.example.com' }
    { key: 'aap.oauth_client_id', value: 'my-client-id' }

  ↓ buildConfigTree(rows, authEnvironment='development')

Config: {
  ansible: { rhaap: { baseUrl: 'https://aap.example.com' } },
  auth: { providers: { rhaap: { development: { host: '...', clientId: '...' } } } },
}
```

Community plugins (GitHub/GitLab SCM, auth providers) read this merged config transparently via `config.getString('integrations.github[0].token')`.

## Security

| Aspect | Implementation |
|--------|---------------|
| **Secrets at rest** | AES-256-GCM encryption with `enc:v1:` prefix, key from `BACKEND_SECRET` |
| **Secrets in API** | Never returned in plaintext — `hasToken: true` pattern |
| **Admin password** | Stored outside DB (env var / K8s Secret / Podman secret) |
| **No shell execution** | Restart via `process.exit(0)` — no `execFile`, no host access |
| **Permissions** | `ansible.admin.view` + `ansible.admin.write` via RBAC |
| **SSL** | `checkSSL` defaults to `false` (configurable per AAP instance) |

## API Endpoints

All endpoints under `/api/rhaap-backend/`:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/setup/status` | Public | Check setup state |
| POST | `/setup/aap` | Admin | Save AAP config |
| POST | `/setup/registries` | Admin | Save registry config |
| POST | `/setup/scm/:provider` | Admin | Save SCM config |
| POST | `/setup/apply` | Admin | Complete setup |
| POST | `/setup/batch` | Admin | Atomic full setup |
| GET | `/connections` | Admin | View all connections |
| PUT | `/connections/aap` | Admin | Update AAP |
| PUT | `/general/local-admin` | Admin | Toggle local admin |

Full OpenAPI spec: `plugins/backstage-rhaap-backend/src/schema/openapi.yaml`
