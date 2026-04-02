# Portal Admin Onboarding - Testing Guide

This guide covers both automated and manual testing for the setup wizard, admin pages, and management APIs.

## API Reference

All endpoints are served under `/api/rhaap-backend/`. Secrets are encrypted at rest (AES-256-GCM) and never returned in API responses — only boolean flags like `hasAdminToken: true`.

### Setup APIs (Day-0 Onboarding)

Used by the setup wizard during initial portal configuration.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/setup/status` | None (public) | Returns `onboardingEnabled`, `setupComplete`, `localAdminEnabled`, `deploymentMode`. Called by the sign-in page to decide which auth mode to show |
| `POST` | `/setup/aap` | Write | Save AAP config: controller URL, admin token, OAuth client ID/secret, SSL toggle. All fields required |
| `POST` | `/setup/registries` | Write | Save registry config: PAH toggle/inherit, certified/validated content, Galaxy toggle |
| `POST` | `/setup/scm/:provider` | Write | Save SCM config for `github` or `gitlab`: provider URL, PAT, discovery scope, OAuth credentials. All fields required |
| `DELETE` | `/setup/scm/:provider` | Write | Remove SCM config for a provider |
| `POST` | `/setup/apply` | Write | Mark setup complete, disable local admin, trigger restart (deployment-aware). Returns `restartTriggered` and `deploymentMode` |
| `POST` | `/setup/batch` | Write | Atomic all-in-one setup: accepts AAP + registries + SCM + apply flag in a single request |

### Connection Management APIs (Day-2 Admin)

Used by the Connections admin page for editing existing configurations.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/connections` | Read | Returns all configured connections with status badges. Secrets masked (`hasAdminToken: true`, never the actual value) |
| `PUT` | `/connections/aap` | Write | Update AAP config. Empty secret fields preserve existing DB values (`allowPartialSecrets`) |
| `PUT` | `/connections/registries` | Write | Update registry toggles and PAH settings |
| `PUT` | `/connections/scm/:provider` | Write | Update SCM config. Empty token/secret fields preserve existing DB values |
| `DELETE` | `/connections/scm/:provider` | Write | Remove SCM provider config entirely |

### Sync APIs

Trigger content sync by proxying to the catalog backend module using service-to-service auth.

| Method | Path | Auth | Catalog Endpoint | What Syncs |
|--------|------|------|-----------------|------------|
| `POST` | `/connections/aap/sync` | Write | `GET /aap/sync_orgs_users_teams` | Organizations, users, teams, job templates from AAP |
| `POST` | `/connections/pah/sync` | Write | `POST /ansible/sync/from-aap/content` | Collections from Private Automation Hub (certified, validated, published repos) |
| `POST` | `/connections/github/sync` | Write | `POST /ansible/sync/from-scm/content` | Ansible content (collections, EE definitions) from GitHub repos |
| `POST` | `/connections/gitlab/sync` | Write | `POST /ansible/sync/from-scm/content` | Ansible content from GitLab repos |

### General Settings API (CLI/API only, not exposed in UI)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PUT` | `/general/local-admin` | Write | Toggle local admin access. Body: `{"enabled": true\|false}`. Use via CLI (`portal-admin set-local-admin`) or `curl` for emergency recovery when AAP OAuth is unavailable |

### Permissions

| Permission | ID | Used For |
|------------|------|----------|
| Read | `ansible.admin.view` | Viewing admin pages, sidebar visibility, `GET /connections` |
| Write | `ansible.admin.write` | Editing connections, triggering sync, toggling local admin, running setup |

### Response Format

All endpoints return a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "error": "message (only on failure)"
}
```

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `400` | Validation error (missing required field, invalid URL, unknown sync type) |
| `403` | Permission denied (missing `ansible.admin.view` or `ansible.admin.write`) |
| `500` | Unexpected server error |

---

## Automated Tests

### Router Tests (Unit)

The backend router has a comprehensive test suite covering all 15 API endpoints:

```bash
# Run router tests
yarn workspace @ansible/backstage-rhaap-backend test -- --testPathPattern='router.test'
```

**Coverage**: 40 tests across these groups:

| Group | Tests | What's covered |
|-------|-------|----------------|
| Setup APIs | 11 | `GET /setup/status`, `POST /setup/aap`, registries, SCM, apply, batch |
| Admin APIs | 7 | `GET /connections`, `PUT /connections/*`, `DELETE /connections/scm/*` |
| General config | 4 | `PUT /general/local-admin` (enable, disable, invalid input) |
| Sync proxy | 7 | AAP/PAH/GitHub/GitLab sync, unknown type, upstream errors, auth tokens |
| Authorization | 11 | All write endpoints return 403 when permission denied |
| Error handling | 1 | Unexpected errors return 500 |

**Test file**: `plugins/backstage-rhaap-backend/src/router.test.ts`

### Encryption Tests (Unit)

```bash
yarn workspace @ansible/backstage-rhaap-backend test -- --testPathPattern='encryption.test'
```

### Run All Backend Plugin Tests

```bash
yarn workspace @ansible/backstage-rhaap-backend test
```

---

## Manual Testing

### Prerequisites

```bash
# Install dependencies
./install-deps

# Start the dev server (frontend + backend)
yarn start
```

Portal will be available at **http://localhost:3000** (frontend) and **http://localhost:7007** (backend).

### Full Reset (Start Fresh)

```bash
# Delete all config (AAP, registries, SCM) and reset setup state
yarn portal-admin full-reset

# Restart backend
pkill -f "backstage-cli"; yarn start
```

### Re-enter Setup Mode (Keep Existing Connections)

```bash
# Reset setup flags only — existing AAP/SCM credentials preserved
yarn portal-admin reset-setup
pkill -f "backstage-cli"; yarn start
```

### Re-enter Setup Mode (Clear Everything)

```bash
# Reset setup flags AND delete all stored config
yarn portal-admin reset-setup --clear-config
pkill -f "backstage-cli"; yarn start
```

---

## API Authentication

| Endpoint | Auth Required | Notes |
|----------|---------------|-------|
| `GET /setup/status` | No (public) | Frontend needs this before login |
| `POST /setup/*` | Yes | Local admin or RBAC admin |
| `GET /connections` | Yes | RBAC admin only |
| `PUT /connections/*`, `PUT /general/*` | Yes | RBAC admin only |
| `POST /connections/:type/sync` | Yes | RBAC admin only |

### Local Development

The `local-admin` provider is configured in `app-config.local.yaml`:

```yaml
auth:
  providers:
    local-admin:
      development:
        password: admin123
```

Get an auth token:

```bash
TOKEN=$(curl -s http://localhost:7007/api/auth/local-admin/refresh \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['backstageIdentity']['token'])")
```

### Production (OpenShift)

```bash
ADMIN_PASS=$(kubectl get secret rhaap-portal-admin-credentials \
  -o jsonpath='{.data.password}' | base64 -d)

TOKEN=$(curl -s -X POST https://portal.example.com/api/auth/rhaap/local-login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['backstageIdentity']['token'])")
```

### Production (RHEL Appliance)

```bash
sudo podman secret inspect portal_admin_password --showsecret

TOKEN=$(curl -s -X POST https://localhost:443/api/auth/rhaap/local-login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['backstageIdentity']['token'])")
```

---

## 1. Check Setup Status

```bash
curl -s http://localhost:7007/api/rhaap-backend/setup/status | python3 -m json.tool
```

Expected (fresh install):

```json
{
  "success": true,
  "data": {
    "onboardingEnabled": true,
    "setupComplete": false,
    "localAdminEnabled": true,
    "deploymentMode": "local"
  }
}
```

## 2. Setup Wizard (UI Flow)

1. Open **http://localhost:3000**
2. Auto-login via the `local-admin` ProxyAuthenticator
3. Wizard redirects to `/self-service/setup`
4. Complete the 5 steps:
   - **Step 1 - Overview**: Review prerequisites, click **Next**
   - **Step 2 - Connect AAP**: Enter Controller URL, Admin Token, Client ID, Client Secret
   - **Step 3 - Connect Registries**: Toggle PAH, Certified/Validated Content, Galaxy
   - **Step 4 - Connect Source Control**: Optionally connect GitHub/GitLab
   - **Step 5 - Review**: Verify settings, click **Apply & Restart Portal**
5. After apply completes, restart backend: `pkill -f "backstage-cli"; yarn start`
6. Login with AAP credentials

## 3. Config-as-Code (API Flow)

Configure everything via management commands instead of the UI:

```bash
# Get auth token
TOKEN=$(curl -s http://localhost:7007/api/auth/local-admin/refresh \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['backstageIdentity']['token'])")

# Configure AAP
curl -s -X POST http://localhost:7007/api/rhaap-backend/setup/aap \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "controllerUrl": "https://aap.example.com",
    "adminToken": "my-aap-token",
    "clientId": "my-client-id",
    "clientSecret": "my-client-secret",
    "checkSSL": false
  }' | python3 -m json.tool

# Configure Registries
curl -s -X POST http://localhost:7007/api/rhaap-backend/setup/registries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pahEnabled": true,
    "pahInheritAap": true,
    "certifiedContent": true,
    "validatedContent": true,
    "galaxyEnabled": true
  }' | python3 -m json.tool

# Configure GitHub (optional)
curl -s -X POST http://localhost:7007/api/rhaap-backend/setup/scm/github \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "providerUrl": "https://github.com",
    "token": "ghp_xxxxxxxxxxxx",
    "targetOrgs": "my-org",
    "oauthClientId": "Iv1.abc123",
    "oauthClientSecret": "secret456"
  }' | python3 -m json.tool

# Apply and finalize
curl -s -X POST http://localhost:7007/api/rhaap-backend/setup/apply \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

After apply, restart the backend: `pkill -f "backstage-cli"; yarn start`

## 4. Post-Setup: Admin Management Commands

### View Connections

```bash
curl -s http://localhost:7007/api/rhaap-backend/connections \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Update AAP Connection (partial - secrets kept)

Empty secret fields preserve the existing stored values:

```bash
curl -s -X PUT http://localhost:7007/api/rhaap-backend/connections/aap \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "controllerUrl": "https://aap-new.example.com",
    "clientId": "updated-client-id",
    "checkSSL": true
  }' | python3 -m json.tool
```

### Update Registries

```bash
curl -s -X PUT http://localhost:7007/api/rhaap-backend/connections/registries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pahEnabled": true,
    "pahInheritAap": false,
    "pahUrl": "https://pah.example.com",
    "pahToken": "pah-token-123",
    "certifiedContent": true,
    "validatedContent": false,
    "galaxyEnabled": true
  }' | python3 -m json.tool
```

### Update/Connect SCM Provider

```bash
curl -s -X PUT http://localhost:7007/api/rhaap-backend/connections/scm/gitlab \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "providerUrl": "https://gitlab.example.com",
    "token": "glpat-xxxx",
    "targetOrgs": "my-group"
  }' | python3 -m json.tool
```

### Delete SCM Provider

```bash
curl -s -X DELETE http://localhost:7007/api/rhaap-backend/connections/scm/gitlab \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Trigger Sync

```bash
# Sync AAP (orgs, users, teams, job templates)
curl -s -X POST http://localhost:7007/api/rhaap-backend/connections/aap/sync \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Sync PAH collections
curl -s -X POST http://localhost:7007/api/rhaap-backend/connections/pah/sync \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Sync GitHub content
curl -s -X POST http://localhost:7007/api/rhaap-backend/connections/github/sync \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Toggle Local Admin Access

```bash
curl -s -X PUT http://localhost:7007/api/rhaap-backend/general/local-admin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' | python3 -m json.tool
```

## 5. Management CLI (portal-admin)

Django-style management commands that connect directly to the database. No running backend required.

```bash
yarn portal-admin --help
```

### Available Commands

```bash
# Show setup status and config count
yarn portal-admin status

# List all configured connections (secrets masked)
yarn portal-admin connections

# Show all config entries in table format
yarn portal-admin show-config

# Full reset — delete ALL config and reset setup (start from scratch)
yarn portal-admin full-reset

# Reset to setup mode (preserves existing connections)
yarn portal-admin reset-setup

# Reset to setup mode AND delete all stored config
yarn portal-admin reset-setup --clear-config

# Toggle local admin access
yarn portal-admin set-local-admin --enable
yarn portal-admin set-local-admin --disable

# Delete all stored config (without resetting setup flags)
yarn portal-admin clear-config

# Delete config for a specific category
yarn portal-admin clear-config --category aap
yarn portal-admin clear-config --category registries
yarn portal-admin clear-config --category scm_github
yarn portal-admin clear-config --category scm_gitlab
```

### Re-enter Setup Mode

**Local Development:**

```bash
yarn portal-admin reset-setup
pkill -f "backstage-cli"; yarn start
```

**OpenShift:**

```bash
# Option 1: Via API (requires admin token)
TOKEN=$(...)
curl -s -X PUT https://portal.example.com/api/rhaap-backend/general/local-admin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
kubectl rollout restart deployment/rhaap-portal

# Option 2: Direct database update via kubectl exec
kubectl exec -it deploy/rhaap-portal-postgresql -- psql -U postgres -d backstage -c \
  "UPDATE portal_setup SET setup_complete = false, local_admin_enabled = true;"
kubectl rollout restart deployment/rhaap-portal
```

**RHEL Appliance:**

```bash
sudo portal-config set LOCAL_ADMIN_ENABLED=true
sudo portal-config set SETUP_COMPLETE=false
sudo systemctl restart portal.service
```

---

## 6. Management Commands by Deployment

The same admin operations are available in all deployments through different tools:

### Local Development (`yarn portal-admin`)

Connects directly to the SQLite database. No running backend required.

```bash
yarn portal-admin status                       # Show setup state
yarn portal-admin connections                   # List connections (secrets masked)
yarn portal-admin show-config                   # Full config table
yarn portal-admin reset-setup                   # Re-enter setup mode
yarn portal-admin set-local-admin --enable      # Toggle local admin
yarn portal-admin clear-config                  # Delete all config
yarn portal-admin clear-config --category aap   # Delete one category
```

### OpenShift (`kubectl exec` or API)

No CLI tools inside the pod. Use the REST API or exec into the pod:

```bash
# View status (public, no auth)
curl -s https://portal.example.com/api/rhaap-backend/setup/status | python3 -m json.tool

# Get admin token
ADMIN_PASS=$(kubectl get secret rhaap-portal-admin-credentials -o jsonpath='{.data.password}' | base64 -d)
TOKEN=$(curl -s -X POST https://portal.example.com/api/auth/rhaap/local-login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['backstageIdentity']['token'])")

# View connections
curl -s https://portal.example.com/api/rhaap-backend/connections \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Toggle local admin
curl -s -X PUT https://portal.example.com/api/rhaap-backend/general/local-admin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Trigger sync
curl -s -X POST https://portal.example.com/api/rhaap-backend/connections/aap/sync \
  -H "Authorization: Bearer $TOKEN"

# Direct database operations (when API is unavailable)
kubectl exec -it deploy/rhaap-portal-postgresql -- psql -U postgres -d backstage -c \
  "SELECT setup_complete, local_admin_enabled FROM portal_setup;"

kubectl exec -it deploy/rhaap-portal-postgresql -- psql -U postgres -d backstage -c \
  "SELECT config_key, CASE WHEN is_secret THEN '********' ELSE config_value END AS value, category \
   FROM portal_config ORDER BY category, config_key;"
```

### RHEL Appliance (`portal-*` CLI tools)

Shell scripts pre-installed at `/usr/local/bin/` that manage Podman containers and PostgreSQL:

```bash
# Status
portal-status

# View configuration
portal-config show

# Modify settings
sudo portal-config set LOCAL_ADMIN_ENABLED=true
sudo portal-config set SETUP_COMPLETE=false

# Restart portal
sudo systemctl restart portal.service

# Backup and restore
sudo portal-backup
sudo portal-restore

# Direct database access (when CLI tools are insufficient)
sudo podman exec portal-postgres psql -U portal -d portal -c \
  "SELECT setup_complete, local_admin_enabled FROM portal_setup;"
```

### Command Equivalence Table

| Operation | Local Dev | OpenShift | RHEL Appliance |
|-----------|-----------|-----------|----------------|
| View status | `yarn portal-admin status` | `curl .../setup/status` | `portal-status` |
| List connections | `yarn portal-admin connections` | `curl .../connections` | `portal-config show` |
| Reset setup (keep config) | `yarn portal-admin reset-setup` | `kubectl exec ... psql` | `portal-config set SETUP_COMPLETE=false` |
| Full reset (wipe all) | `yarn portal-admin full-reset` | `kubectl exec ... psql` | `portal-config set SETUP_COMPLETE=false` + `podman exec ... psql DELETE` |
| Enable local admin | `yarn portal-admin set-local-admin --enable` | `curl PUT .../general/local-admin` | `portal-config set LOCAL_ADMIN_ENABLED=true` |
| Rotate admin password | N/A (plain text in config) | `oc delete secret ...; rerun job` | `portal-config set ADMIN_PASSWORD=newpass` |
| Trigger sync | API: `curl POST .../connections/aap/sync` | API: `curl POST .../connections/aap/sync` | API: `curl POST .../connections/aap/sync` |
| Clear config | `yarn portal-admin clear-config` | `kubectl exec ... psql` | `podman exec ... psql` |
| Restart | `pkill -f backstage-cli; yarn start` | `kubectl rollout restart` | `systemctl restart portal.service` |
