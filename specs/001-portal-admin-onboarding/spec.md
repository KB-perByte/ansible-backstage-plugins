# SPEC: Portal Admin Setup & Onboarding Experience

**Jira**: ANSTRAT-1806
**Date**: 2026-03-24
**Status**: Implemented — Verified with E2E tests

---

## 1. Problem Statement

When the Ansible Self-Service Portal (built on RHDH) is deployed for RHEL or Ansible-on-Clouds, there is **no guided onboarding experience**. The administrator must manually populate Kubernetes secrets (`secrets-rhaap-portal`, `secrets-scm`) with AAP OAuth credentials, SCM tokens, and AAP API tokens **before** the portal can function. This is error-prone and creates a poor first-run experience.

## 2. Goal

Provide a **setup wizard** that launches on first boot, allowing the administrator to configure all external connections through the portal UI **or via API calls** (config-as-code). After setup, provide ongoing **admin pages** (Connections, General, RBAC) for managing these connections.

## 3. Scope

### In Scope

- Setup wizard (5-step flow) for day-0 configuration via UI
- **Config-as-Code API**: All setup steps automatable via REST API calls
- Local admin authentication for the setup session
- Database-backed configuration storage (PostgreSQL in production, better-sqlite3 in local dev)
- Configuration merging: DB-stored values injected via a custom Backstage `ConfigSource` so community plugins work unchanged
- Post-setup admin pages: General, Connections, RBAC & User Groups
- Helm chart changes to support setup mode
- **Security**: Encryption at rest (AES-256-GCM), transport security (TLS), input validation

### Out of Scope

- Multi-tenant setup flows
- Automated AAP OAuth application creation (admin creates this in AAP manually)
- Custom RBAC policy editor (existing RHDH RBAC plugin is used)

## 3A. Deployment Modes & Onboarding Flag

### 3A.1 Onboarding Control Flag

The setup wizard visibility is controlled by a config flag in `app-config.yaml`:

```yaml
ansible:
  portal:
    onboarding:
      enabled: true   # true = show setup wizard on first boot; false = skip
```

| Deployment | Default | Rationale |
|------------|---------|-----------|
| **RHEL Appliance** (bootc qcow2) | `true` | Greenfield deployment. TUI handles infra config (ports, DB, SSL), then portal starts and admin does day-0 config via setup wizard. |
| **OpenShift** (Helm chart, new install) | `true` | New deployments benefit from guided setup. |
| **OpenShift** (Helm chart, existing) | `false` | Existing deployments already have `secrets-rhaap-portal` and `secrets-scm` populated. Portal works immediately with configmap-based config. |
| **Local Development** | `false` | `app-config.local.yaml` has credentials. Setup wizard is optional. |

When `enabled: false`:
- The `DatabaseConfigSource` still loads any DB config (for admin page edits)
- But the setup wizard is never shown
- The portal boots directly into the normal sign-in page
- The ADMINISTRATION sidebar admin pages (Connections, General) are still available for day-2 changes

### 3A.2 Deployment Architecture Comparison

| Aspect | OpenShift | RHEL Appliance |
|--------|-----------|----------------|
| **Runtime** | Pod in K8s Deployment | Podman Quadlet via systemd (`portal.service`) |
| **Config storage** | PostgreSQL (in-cluster or external) | PostgreSQL (local Podman container or external) |
| **Static config** | Helm `values.yaml` → ConfigMap → `app-config.yaml` | `/etc/portal/configs/app-config.yaml` |
| **Secrets** | K8s Secrets (`secrets-rhaap-portal`) | Podman secrets (`portal_aap_token`, etc.) |
| **Restart mechanism** | `kubectl rollout restart deployment` | `systemctl restart portal.service` |
| **Infra config (pre-portal)** | Helm values | TUI wizard (`portal-setup.py`) — ports, DB, SSL, backup |
| **Day-0 config (portal)** | Setup wizard or API | Setup wizard or API |
| **Plugin loading** | OCI artifacts or tarball from registry | Pre-baked in bootc image at `/usr/share/portal/plugins/` |

### 3A.3 RHEL Appliance Boot Sequence

```
1. VM boots → systemd starts services
2. first-boot-config.service → SSH key setup (TUI or cloud-init)
3. portal-setup.py (TUI) → Infra config: ports, DB, SSL, backup
   → Writes /etc/portal/.portal.env + Podman secrets
4. portal-config-check.service → Validates config
5. portal.service starts → RHDH + plugins loaded
6. Admin visits https://<host>:443 → Setup wizard (onboarding.enabled: true)
7. Admin configures AAP, registries, SCM → "Apply & Restart Portal"
8. portal.service restarts → DatabaseConfigSource loads config from PostgreSQL
9. AAP OAuth active → Admin logs in with AAP credentials
```

### 3A.4 Restart Strategy

After "Apply & Restart Portal", the backend needs to restart the portal service so that:
- `DatabaseConfigSource` re-reads config from PostgreSQL
- Auth providers are re-initialized with new OAuth credentials
- Community SCM integrations pick up new tokens

| Deployment | Restart Mechanism | Implementation |
|------------|-------------------|----------------|
| **OpenShift** | K8s API rollout restart | Backend patches deployment annotation via K8s API (scoped ServiceAccount RBAC). Falls back to graceful `process.exit(0)` if API call fails — K8s `restartPolicy: Always` restarts the pod. |
| **RHEL Appliance** | Graceful `process.exit(0)` | Backend exits cleanly. systemd `Restart=always` restarts the Podman container. No shell execution, no host access needed. |
| **Local Development** | Manual | Frontend shows "Please restart the backend manually". Admin re-runs `yarn start`. |

**Security**: No `execFile`, `exec`, or shell spawning. The backend never executes scripts or accesses host systemd. On RHEL, the container has no host socket mounts.

The frontend "Applying configuration" screen (Screen 9):
1. Calls `POST /api/rhaap-backend/setup/apply` — saves config, marks complete
2. Backend sends `200` response, then schedules graceful exit (2s delay)
3. Frontend shows "Applying configuration..." and polls `GET /setup/status` every 2s
4. Requests fail during restart (expected) — frontend keeps polling
5. When backend comes back healthy: shows "System Configured & Ready" (Screen 10)
6. If no response after 90 seconds: shows "Restart may require manual intervention"

### 3A.5 Backward Compatibility: Existing OpenShift Deployments

For existing OpenShift deployments that already have secrets configured:

1. **Helm chart default**: `ansible.portal.onboarding.enabled: false` — no wizard shown
2. **Existing `secrets-rhaap-portal`**: Continue to work via env var injection in `values.yaml` (unchanged)
3. **DatabaseConfigSource**: If `portal_config` table is empty, it returns empty config — the static `app-config.yaml` values (fed from env vars/secrets) are used as-is
4. **Admin pages available**: Platform admins can still access ADMINISTRATION > Connections to view/edit config. First edit will migrate config from static to DB-backed storage.
5. **Migration path**: If an existing deployment wants to switch to DB-backed config, admin sets `onboarding.enabled: true`, re-runs the setup wizard, which populates the DB. Future restarts use DB config.

### 3A.6 Auth Provider Hot-Reload (RHAAP Module Modification)

Since we control the `auth-backend-module-rhaap-provider`, we can modify the RHAAP authenticator to support config hot-reload:

**Current behavior** (from `authenticator.ts`):
```typescript
initialize({ callbackUrl, config }) {
  const clientId = config.getString('clientId');  // Read ONCE at startup
  // ... cached for lifetime of process
}
```

**Proposed modification**:
```typescript
initialize({ callbackUrl, config }) {
  // Read from static config as defaults
  const staticClientId = config.getOptionalString('clientId');
  // But on each authenticate()/refresh() call, check DB for overrides
  return { ..., configService: this.configService };
}

async authenticate(input, ctx) {
  // Read latest config from DB (with in-memory cache + TTL)
  const dbConfig = await ctx.configService.getAAPConfig();
  const clientId = dbConfig?.clientId ?? ctx.staticClientId;
  // ... use dynamic values
}
```

**Impact**: This eliminates the restart requirement for AAP auth changes specifically. After setup wizard saves to DB, the next login attempt uses the new config. Community GitHub/GitLab auth providers still need restart for their OAuth config changes, but since SCM auth is supplementary and typically configured in the same setup session, this is acceptable.

## 4. User Personas

| Persona | Description |
|---------|-------------|
| **Setup Admin** | First user to access the portal after deployment. Logs in with temporary local admin credentials. Performs day-0 configuration via UI or API. |
| **Platform Admin** | AAP superuser who manages the portal post-setup via the Administration sidebar. |
| **Automation Engineer** | Uses the Config-as-Code API to automate portal provisioning in CI/CD pipelines. |
| **Developer** | End user who logs in via AAP SSO and uses self-service automation templates. |

## 5. User Flow

### 5.1 First Boot (Setup Mode) — UI Flow

```
Portal deploys with ansible.portal.onboarding.enabled: true
  → Backend checks: onboarding enabled AND portal_setup.setup_complete = false
  → User visits portal URL → Redirected to local admin login
  → Setup wizard loads (5 steps)
  → Admin completes wizard → "Apply & Restart Portal"
  → Config saved to database, setup marked complete
  → Backend triggers restart (OpenShift: rollout, RHEL: systemctl, local: manual)
  → "System Configured & Ready" screen
  → Admin clicks "Go to login"
  → On restart: DatabaseConfigSource loads config from DB
  → Admin logs in with AAP credentials → Normal portal experience
```

### 5.2 First Boot (Setup Mode) — Config-as-Code Flow

```
Portal deploys → Setup mode detected
  → Operator authenticates with local admin credentials via API
  → POST /api/rhaap-backend/setup/aap          (configure AAP)
  → POST /api/rhaap-backend/setup/registries    (configure registries)
  → POST /api/rhaap-backend/setup/scm/github    (configure GitHub)
  → POST /api/rhaap-backend/setup/apply         (mark complete, trigger restart)
  → Pod restarts → Config loaded from DB → AAP OAuth active
```

### 5.3 Normal Boot (Setup Complete)

```
Portal deploys → Setup complete detected (config exists in DB)
  → DatabaseConfigSource loads config from portal_config table
  → Config merged with app-config.yaml (DB values override)
  → All plugins (including community GitHub/GitLab) see merged config
  → AAP OAuth active → Standard sign-in page
  → Users log in via AAP → Self-service portal
```

### 5.4 Emergency Recovery

```
Admin enables "Local Admin Access (Bootstrap)" toggle in General settings
  → Local auth re-enabled alongside AAP auth
  → Admin can reconfigure connections if AAP is unreachable
```

## 6. Functional Requirements

### FR-1: Setup Status Detection

- **FR-1.1**: The backend MUST expose a `GET /api/rhaap-backend/setup/status` endpoint returning `{ onboardingEnabled: boolean, setupComplete: boolean, localAdminEnabled: boolean, deploymentMode: "openshift" | "rhel" | "local" }`.
- **FR-1.2**: The frontend MUST check setup status on app load and redirect to the setup wizard if `onboardingEnabled === true AND setupComplete === false`.
- **FR-1.3**: The setup status MUST be stored in the database (table: `portal_setup`).
- **FR-1.4**: The `onboardingEnabled` flag is read from `ansible.portal.onboarding.enabled` in `app-config.yaml` (static config). It is NOT stored in the database.
- **FR-1.5**: The status endpoint MUST be accessible without authentication (public) so the frontend can determine which login page to show.
- **FR-1.6**: The `deploymentMode` is auto-detected: `"rhel"` if `/etc/portal/.portal.env` exists, `"openshift"` if running in a K8s pod, `"local"` otherwise.

### FR-2: Local Admin Authentication

- **FR-2.1**: When setup is not complete, the portal MUST allow login with a local admin account (username: `admin`, password: auto-generated and stored in a Kubernetes secret or config file).
- **FR-2.2**: The local admin MUST have full RBAC admin/superUser permissions.
- **FR-2.3**: Post-setup, local admin access MUST be disabled by default but can be re-enabled via the General admin page (Screen 11).
- **FR-2.4**: For local development, the guest auth provider serves as the local admin mechanism.
- **FR-2.5**: On RHEL deployments, the admin password MUST be written to a file readable only by the portal system user (e.g., `/etc/ansible-portal/admin-credentials`).

### FR-3: Setup Wizard — Step 1: Overview (Screen 2)

- **FR-3.1**: Display title "Setup Ansible Automation Portal" with stepper navigation (1. Overview, 2. Connect AAP, 3. Connect Registries, 4. Connect Source Control, 5. Review).
- **FR-3.2**: Show "Overview & Prerequisites" content listing:
  - AAP Controller URL and OAuth credentials (Client ID & Secret)
  - AAP Personal Access Token (requires System Administrator privileges)
  - Git Provider App ID, Private Key, and Client ID/Secret for content discovery and SSO
- **FR-3.3**: "Next" button advances to Step 2.

### FR-4: Setup Wizard — Step 2: Connect AAP (Screen 3)

- **FR-4.1**: Form fields:
  - **AAP Controller URL** (required, text, placeholder: `https://aap.example.com`, helper: "Enter the URL of your Automation Controller (e.g. https://aap.example.com)")
  - **Admin Personal Access Token** (required, password, helper: "Paste an Admin Token from AAP here.")
  - **Client ID** (required, text)
  - **Client Secret** (required, password)
- **FR-4.2**: Link "Find these under AAP application settings" (external link icon).
- **FR-4.3**: Section headers: "Connect AAP", "Service Access (Discovery & Execution)", "User Sign-in (OAuth)".
- **FR-4.4**: "Back" and "Next" buttons. "Next" validates all required fields and saves draft to backend via `POST /api/rhaap-backend/setup/aap` before advancing.
- **FR-4.5**: AAP Controller URL is reused as `auth.providers.rhaap.<env>.host` and `ansible.rhaap.baseUrl`.
- **FR-4.6**: Admin PAT is stored as `ansible.rhaap.token`.
- **FR-4.7**: Client ID/Secret stored as `auth.providers.rhaap.<env>.clientId` and `auth.providers.rhaap.<env>.clientSecret`.

### FR-5: Setup Wizard — Step 3: Connect Registries (Screen 4)

- **FR-5.1**: **Private Registries (Private Automation Hub)**:
  - Toggle: "Private Automation Hub (PAH): On" (default on)
  - Checkbox: "Use connection details from AAP (Step 2)" (default checked)
  - Helper: "When checked, the Private Automation Hub URL and Token will be inherited from the AAP Controller. Uncheck this box to manually enter credentials for a standalone Private Hub."
  - When unchecked: Show PAH URL and Token fields.
- **FR-5.2**: **Red Hat Ansible Automation Hub (Public)**:
  - Toggle: "Certified Content: On" (default on)
  - Toggle: "Validated Content: On" (default on)
- **FR-5.3**: **Ansible Galaxy (community)**:
  - Toggle: "Ansible Galaxy: On" (default on)
- **FR-5.4**: All toggles saved via `POST /api/rhaap-backend/setup/registries`.

### FR-6: Setup Wizard — Step 4: Connect Source Control (Screens 5, 6, 7)

- **FR-6.1**: Display provider cards dynamically from the SCM provider registry (see Section 7). Initially GitHub and GitLab; extensible to Bitbucket and others without wizard framework changes.
- **FR-6.2**: Clicking "Connect" opens a modal dialog.
- **FR-6.3**: **GitHub Connect modal** (Screen 6) fields:
  - **Service Access (Discovery & Creation)**:
    - Provider URL (required, text, placeholder: `e.g., https://github.org.com`)
    - Personal Access Token (PAT) (required, password) — for service account content discovery and scaffolder push
  - **Discovery Scope**:
    - Target Organization (text, placeholder: `e.g., my-company, ansible-team-a`, helper: "Comma-separated list of organizations to scan")
    - EE Definition Filename (text, default: `execution-environment.yml`)
    - Source Branches (text, default: `Main`)
    - Max Folder Depth (number)
  - **User Sign-in (SSO)**:
    - Client ID (text) — for GitHub OAuth App SSO login
    - Client Secret (password)
- **FR-6.4**: **GitLab Connect modal** — Same structure adapted for GitLab (Provider URL defaults to `https://gitlab.com`).
- **FR-6.5**: After connecting, card shows "Connected" status with "Edit" button (Screen 7).
- **FR-6.6**: SCM config saved via `POST /api/rhaap-backend/setup/scm/:provider`.
- **FR-6.7**: PAT maps to `integrations.github[0].token` — consumed by community `@backstage/integration` via `ScmIntegrations.fromConfig()` and `readGithubIntegrationConfigs()` for content discovery and scaffolder push.
- **FR-6.8**: OAuth Client ID/Secret maps to `auth.providers.github.<env>.clientId` / `clientSecret` — used by community `@backstage/plugin-auth-backend-module-github-provider` for user SSO. These are **supplementary** to AAP auth (see Section 7.5).
- **FR-6.9**: Discovery scope fields map to `catalog.providers.rhaap.<env>.sync.ansibleGitContents.providers.github` config structure (consumed by our `AnsibleGitContentsProvider`).
- **FR-6.10**: Source Control step is marked as "(Recommended)" — not required to complete setup.
- **FR-6.11**: The modal form fields are driven by the SCM provider descriptor (Section 7.2), making it trivial to add Bitbucket or other providers in the future.

### FR-7: Setup Wizard — Step 5: Review (Screen 8)

- **FR-7.1**: Display a read-only summary of all configured values organized by section:
  - **Connect AAP**: Controller URL, OAuth Client ID, Client Secret (masked `********`), Admin PAT (masked), Sync Schedule
  - **Connect Registries**: Public Registries (which are on), Private Automation Hub (source)
  - **Connect Source Control**: Per-provider summary (GitHub/GitLab) with discovery details and SSO status
- **FR-7.2**: Note at bottom: "Note: Sensitive values like secrets, keys, and tokens are masked for security."
- **FR-7.3**: "Back" and "Apply & Restart Portal" buttons.
- **FR-7.4**: Clicking "Apply & Restart Portal" calls `POST /api/rhaap-backend/setup/apply` which:
  1. Validates all required config is present
  2. Marks setup as complete (`portal_setup.setup_complete = true`)
  3. Disables local admin access (`portal_setup.local_admin_enabled = false`)
  4. Returns success → frontend shows "Applying configuration" screen (FR-8)

### FR-8: Applying Configuration (Screen 9)

- **FR-8.1**: Full-screen loading indicator with:
  - Spinner animation
  - Text: "Applying configuration...."
  - Sub-text: "Writing configuration files..."
- **FR-8.2**: After `apply` API returns success, transition to completion screen (FR-9).

### FR-9: Setup Complete (Screen 10)

- **FR-9.1**: Full-screen success indicator with:
  - Green checkmark icon
  - Title: "System Configured & Ready"
  - Text: "The setup is complete and the temporary admin session has ended. You can log in using your configured identity provider"
  - "Go to login" button (primary, blue)
- **FR-9.2**: "Go to login" logs the user out and redirects to the sign-in page.

### FR-10: Post-Setup — General Page (Screen 11)

- **FR-10.1**: Route: `/admin/general` (sidebar: ADMINISTRATION > General).
- **FR-10.2**: **Security & Access Control** card:
  - Toggle: "Local Admin Access (Bootstrap): Off"
  - Description: "Allow authentication using the built-in 'admin' account. Keep this disabled unless you are performing initial setup or need emergency recovery when SSO is unavailable."
- **FR-10.3**: Toggle change calls `PUT /api/rhaap-backend/general/local-admin`.

### FR-11: Post-Setup — Connections Page (Screen 12)

- **FR-11.1**: Route: `/admin/connections` (sidebar: ADMINISTRATION > Connections).
- **FR-11.2**: Title: "Connections", subtitle: "Manage integrations with external platforms for content discovery and user authentication (SSO)".
- **FR-11.3**: **Automation & Content Platforms** section with cards:
  - **Ansible Automation Platform (AAP)**: Content discovery status, Login (SSO) status, Host, Auth method. "Edit" and "Sync now" buttons.
  - **Private Automation Hub (PAH)**: Content discovery status, Host, credential source. "Edit" and "Sync now" buttons.
  - **Public Registers**: Toggles for Red Hat Certified Content, Validated Content, Ansible Galaxy with external links.
- **FR-11.4**: **Source control providers** section with cards:
  - **GitHub**: Content discovery status, Login (SSO) status, Host, Auth method. "Edit" / "Sync now".
  - **GitLab**: Same structure.
- **FR-11.5**: "Edit" opens the same form as the setup wizard step for that connection (pre-filled with current values, secrets shown as masked placeholders).
- **FR-11.6**: "Sync now" triggers manual sync for the relevant entity provider.

### FR-12: Post-Setup — RBAC & User Groups (Screen 1)

- **FR-12.1**: Route: `/admin/rbac` (sidebar: ADMINISTRATION > RBAC).
- **FR-12.2**: Title: "RBAC & User Groups", subtitle: "Manage portal permissions for groups synced from external identity providers."
- **FR-12.3**: Filters: Source (dropdown: All), Portal Role (dropdown: All).
- **FR-12.4**: **User groups** table with columns: Group name (link), Source (e.g., "AAP"), Members (e.g., "18 users"), Portal Role (dropdown: Editor/Viewer/Admin), Last Sync.
- **FR-12.5**: Search bar and pagination controls.

## 7. Admin Page Permissions

### 7.1 Permission Pattern

The existing self-service plugin uses Backstage's permission framework for access control:
- **Route-level**: `<RequirePermission>` wrapper in `RouteView.tsx` (e.g., `catalogEntityCreatePermission` for catalog-import, `taskReadPermission` for task pages)
- **Component-level**: `usePermission()` hook for conditional rendering (e.g., showing/hiding sync buttons based on `catalogEntityCreatePermission`)

Admin pages MUST follow the same pattern with new custom permissions.

### 7.2 Custom Permissions

Define in `backstage-rhaap-common/src/admin/permissions.ts`:

| Permission | ID | Type | Used For |
|------------|-----|------|----------|
| `portalAdminViewPermission` | `ansible.admin.view` | `BasicPermission` | View admin pages (General, Connections, RBAC), see ADMINISTRATION sidebar items |
| `portalAdminWritePermission` | `ansible.admin.write` | `BasicPermission` | Modify settings (toggle local admin, edit connections, trigger sync, run setup wizard) |

### 7.3 Frontend Usage

**Route-level gating** (in `RouteView.tsx`):
```tsx
<Route path="admin/general" element={
  <RequirePermission permission={portalAdminViewPermission}>
    <GeneralPage />
  </RequirePermission>
} />
```

**Component-level conditional rendering** (e.g., in `ConnectionCard.tsx`):
```tsx
const { allowed: canEdit } = usePermission({ permission: portalAdminWritePermission });
// "Edit" and "Sync now" buttons only rendered if canEdit === true
```

**Sidebar menu visibility** (ADMINISTRATION section):
```tsx
const { allowed: canViewAdmin } = usePermission({ permission: portalAdminViewPermission });
// ADMINISTRATION menu group only shown if canViewAdmin === true
```

### 7.4 Backend Authorization

All admin API endpoints check permissions via `permissions.authorize()`:
- `GET /connections` → requires `portalAdminViewPermission`
- `PUT /connections/*`, `POST /setup/*`, `PUT /general/*` → requires `portalAdminWritePermission`
- `GET /setup/status` → public (no permission needed)

### 7.5 RBAC Configuration

The permissions are manageable via the RHDH RBAC plugin. Default policy grants admin permissions to `user:default/admin` and `group:default/aap-admins` (AAP superusers):

```yaml
# Helm values.yaml
permission:
  rbac:
    pluginsWithPermission: [catalog, scaffolder, permission, rhaap-backend]  # Add rhaap-backend
```

RBAC policy (CSV or API):
```csv
p, role:default/admin, ansible.admin.view, read, allow
p, role:default/admin, ansible.admin.write, create, allow
g, group:default/aap-admins, role:default/admin
```

### 7.6 Backend Permission Registration

The `backstage-rhaap-backend` plugin registers its permissions with Backstage's permission framework using `permissionsRegistry.addPermissions()` (following the pattern used by RHDH plugins like the extensions plugin).

## 7A. Local Admin Authentication & Recovery Mechanism

### 7A.1 Problem

The setup wizard requires an authenticated admin session before AAP OAuth is configured. Guest auth is not suitable for production:
- No credentials — anyone can access the setup wizard
- No audit trail of who performed setup
- No recovery mechanism when AAP becomes unreachable after setup

### 7A.2 Solution: Dual-Mode RHAAP Auth Provider

Instead of creating a separate auth module, the existing `auth-backend-module-rhaap-provider` is extended to support two modes within the single `rhaap` provider:

```
RHAAP Auth Provider (single provider, two modes):
  ├── Mode 1: AAP OAuth 2.0 (primary, post-setup)
  │   └── GET /api/auth/rhaap/start → OAuth redirect to AAP
  │
  └── Mode 2: Local Admin (bootstrap/recovery)
      └── POST /api/auth/rhaap/local-login → username/password validation
```

The sign-in page shows only the RHAAP provider. When `localAdminEnabled=true`, a "Local Admin" tab/card appears with a username/password form. When `localAdminEnabled=false`, only the AAP OAuth button is shown.

### 7A.3 End-to-End Flow

**RHEL Appliance:**
```
1. portal-setup.py TUI runs (before portal starts)
   → Generates ADMIN_PASSWORD (24-char random) + bcrypt hash
   → Stores hash as Podman secret: portal_admin_password_hash
   → Stores password in /var/log/portal/first-boot.log (one-time display)
   → Creates all other secrets (BACKEND_SECRET, POSTGRESQL_PASSWORD, etc.)
2. Portal starts → Quadlet injects PORTAL_ADMIN_PASSWORD_HASH as env var
3. Login page shows "Local Admin" card (localAdminEnabled=true in fresh DB)
4. Admin enters admin/<generated-password> → bcrypt validated
5. Setup wizard → enters AAP credentials → saved to DB
6. "Apply & Restart Portal" → setup_complete=true, local_admin_enabled=false
7. Portal restarts → DatabaseConfigSource loads AAP config from DB
8. Login page shows only "Ansible Automation Platform" (local admin hidden)
9. Admin logs in with AAP credentials → normal portal experience
```

**OpenShift (Helm):**
```
1. helm install → pre-install hook Job generates K8s Secret:
   rhaap-portal-admin-credentials:
     password: <random-24-char>
     password-hash: <bcrypt-hash>
   Password displayed in helm install NOTES.txt output
2. Portal pod starts → PORTAL_ADMIN_PASSWORD_HASH injected via secretKeyRef
3. Same flow as RHEL from step 3 onward
```

**Local Development:**
```
1. app-config.local.yaml:
   ansible:
     portal:
       admin:
         password: admin123  # Plain text for dev — no bcrypt needed
2. Authenticator reads password from config (falls back from env var)
3. Same flow as above from step 3 onward
```

### 7A.4 Functional Requirements

- **FR-LA-1**: The existing `auth-backend-module-rhaap-provider` MUST be extended with a `POST /local-login` endpoint for username/password authentication alongside the existing OAuth flow.
- **FR-LA-2**: The local admin authenticator MUST validate against a bcrypt hash from `PORTAL_ADMIN_PASSWORD_HASH` env var (production) or plain password from `ansible.portal.admin.password` config (local dev).
- **FR-LA-3**: The local-login endpoint MUST only accept requests when `portal_setup.local_admin_enabled = true` in the database. Returns 403 otherwise.
- **FR-LA-4**: The sign-in page MUST show a single "Ansible Automation Platform" provider with two modes:
  - When `localAdminEnabled=true`: Shows "Local Admin" card with username/password form
  - When `localAdminEnabled=false`: Shows "Sign in with AAP" OAuth button only
- **FR-LA-5**: Successful local admin auth MUST resolve to `user:default/admin` with full RBAC superUser permissions.
- **FR-LA-6**: After setup wizard "Apply & Restart Portal", `local_admin_enabled` MUST be set to `false`.
- **FR-LA-7**: The General admin page toggle re-enables local admin for emergency recovery.

### 7A.5 Secret Lifecycle per Deployment

**RHEL (Podman Secrets):**

| When | What | How |
|------|------|-----|
| `portal-setup.py` TUI runs | Generate admin password + bcrypt hash | `create_portal_secret("ADMIN_PASSWORD_HASH", hash)` following existing pattern in `lib/common.sh` |
| Portal container starts | Hash injected as env var | `Secret=portal_admin_password_hash,type=env,target=PORTAL_ADMIN_PASSWORD_HASH` in `portal.container` quadlet |
| Password rotation | Operator changes password | `sudo portal-config set ADMIN_PASSWORD=<new>` → generates new hash → updates Podman secret → restarts |
| Recovery | Enable local admin | `sudo portal-config set LOCAL_ADMIN_ENABLED=true` → updates SQLite DB directly → restarts |

**OpenShift (K8s Secrets):**

| When | What | How |
|------|------|-----|
| `helm install` | Generate admin password + bcrypt hash | Pre-install hook Job creates `rhaap-portal-admin-credentials` Secret |
| Portal pod starts | Hash injected as env var | `secretKeyRef` in `values.yaml` `extraEnvVars` |
| Password rotation | Operator changes password | `kubectl patch secret rhaap-portal-admin-credentials ...` → rollout restart |
| Recovery | Enable local admin | `kubectl exec` to update `portal_setup` table → rollout restart |

**Local Dev:**

| When | What | How |
|------|------|-----|
| Developer sets config | Plain password in config | `ansible.portal.admin.password: admin123` in `app-config.local.yaml` |
| Backend starts | Reads from config | No hashing, no secrets — direct string comparison |

### 7A.6 Recovery Mechanism

| Scenario | RHEL Recovery | OpenShift Recovery |
|----------|--------------|-------------------|
| **AAP unreachable** | `sudo portal-config set LOCAL_ADMIN_ENABLED=true && sudo systemctl restart portal.service` | `kubectl exec deploy/rhaap-portal -- node -e "..."` + `kubectl rollout restart` |
| **OAuth misconfigured** | Same as above → login → edit Connections → restart | Same as above |
| **Forgot admin password** | `sudo portal-config set ADMIN_PASSWORD=newpass` | `kubectl patch secret rhaap-portal-admin-credentials ...` + restart |
| **Complete reset** | `sudo portal-config reset` (deletes DB, regenerates secrets) | Delete PVC + rollout restart |

### 7A.7 Security

| Control | Implementation |
|---------|---------------|
| **Brute force** | Rate limit: 5 failed attempts/min, 30s lockout |
| **Password storage** | bcrypt hash in K8s Secret/Podman secret — NOT in portal DB |
| **Session timeout** | 1 hour (shorter than AAP 8-hour sessions per Nexus pattern) |
| **Audit logging** | All auth events logged with `isAuditEvent=true`, no passwords in logs |
| **Disabled by default** | After setup completion, must be explicitly re-enabled |
| **No remote reset** | Password change requires cluster/VM operator access |

### 7A.8 Sign-In Page Design

Single-provider sign-in page with conditional rendering:

```
┌─────────────────────────────────────┐
│  Ansible Automation Platform        │
│                                     │
│  [When localAdminEnabled=true:]     │
│  ┌─────────────────────────────┐    │
│  │ Local Admin (Bootstrap)     │    │
│  │ Username: [admin         ]  │    │
│  │ Password: [**************]  │    │
│  │        [Sign In]            │    │
│  └─────────────────────────────┘    │
│                                     │
│  [When localAdminEnabled=false:]    │
│  ┌─────────────────────────────┐    │
│  │ Sign in using AAP           │    │
│  │        [Sign In]            │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## 8. Extensible SCM Provider Architecture

### 7.1 Design Principle

AAP is the **primary and permanent IDP**. SCM providers (GitHub, GitLab, and future Bitbucket) serve two secondary roles:
1. **Content Discovery**: Service-account PAT used to discover Ansible content (collections, EE definitions) from SCM organizations.
2. **User SSO (Optional)**: OAuth App credentials allow users to push scaffolded repositories using their own SCM identity.

The architecture MUST make it trivial to add new SCM providers (e.g., Bitbucket) without modifying the core setup wizard framework or backend API structure.

### 7.2 Provider Registry Pattern

Each SCM provider is defined by a provider descriptor:

```typescript
interface SCMProviderDescriptor {
  id: string;                    // 'github' | 'gitlab' | 'bitbucket'
  name: string;                  // 'GitHub' | 'GitLab' | 'Bitbucket'
  icon: React.ComponentType;     // Provider logo icon
  defaultHost: string;           // 'github.com' | 'gitlab.com' | 'bitbucket.org'

  // Config mapping: how this provider's settings map to Backstage config paths
  configMapping: {
    integrationConfigPath: string;   // 'integrations.github' | 'integrations.gitlab' | 'integrations.bitbucketCloud'
    authProviderConfigPath: string;  // 'auth.providers.github' | 'auth.providers.gitlab' | 'auth.providers.bitbucketServer'
    catalogProviderType: string;     // 'github' | 'gitlab' — used in ansibleGitContents.providers.*
  };

  // Form field configuration (which fields to show in the connect modal)
  fields: {
    discovery: SCMFieldConfig[];     // Service access fields (URL, PAT)
    scope: SCMFieldConfig[];         // Discovery scope fields (orgs, branches, etc.)
    sso: SCMFieldConfig[];           // OAuth fields (clientId, clientSecret)
  };
}
```

### 7.3 Adding a New SCM Provider

To add Bitbucket support in the future:

1. **Create a new provider descriptor** (e.g., `bitbucketProvider.ts`) — ~50 lines defining fields and config mapping.
2. **Register it in the provider registry** — one-line import.
3. **No changes needed to**: Setup wizard framework, API endpoints, database schema, config merging logic, or encryption.

The `POST /api/rhaap-backend/setup/scm/:provider` API already accepts any provider ID. The `portal_config` table uses category `scm_<provider>` which naturally extends.

### 7.4 Config Paths Consumed by Community Plugins

These are the exact Backstage config paths that community SCM plugins read (confirmed from source analysis of `@backstage/integration` and community-plugins repo). Our `DatabaseConfigSource` MUST provide these:

**GitHub** (via `ScmIntegrations.fromConfig()` and `readGithubIntegrationConfigs()`):
```yaml
integrations:
  github:
    - host: github.com            # Required
      token: ghp_xxxx             # Required — service account PAT
      apiBaseUrl: https://api.github.com  # Optional, for GHE

auth:
  providers:
    github:
      <env>:
        clientId: Iv1.abc123      # For user SSO login
        clientSecret: secret456
        signIn:
          resolvers:
            - resolver: usernameMatchingUserEntityName
```

**GitLab** (via `ScmIntegrations.fromConfig()` → `integrations.gitlab.byHost()`):
```yaml
integrations:
  gitlab:
    - host: gitlab.com            # Required
      token: glpat-xxxx           # Required — service account PAT
      apiBaseUrl: https://gitlab.com/api/v4  # Optional

auth:
  providers:
    gitlab:
      <env>:
        clientId: app-id
        clientSecret: secret789
        signIn:
          resolvers:
            - resolver: usernameMatchingUserEntityName
```

**Bitbucket (future)** (via `ScmIntegrations.fromConfig()`):
```yaml
integrations:
  bitbucketCloud:
    - host: bitbucket.org
      username: user
      appPassword: xxxx

auth:
  providers:
    bitbucketServer:
      <env>:
        clientId: ...
        clientSecret: ...
```

### 7.5 AAP as Primary IDP — Architectural Guarantee

- AAP OAuth (`auth.providers.rhaap`) is always configured and is the primary sign-in method.
- SCM auth providers are **supplementary** — they enable "Link SCM Account" functionality for pushing scaffolded repos, NOT for portal login.
- The `signInPage` config always points to `rhaap`. SCM providers do not appear on the login page.
- The `auth.providers.github/gitlab` are only used when a user triggers a scaffolder action that requires SCM write access — Backstage's `OAuthRequestDialog` handles the consent flow.

## 8. Security Considerations

> **Note**: Section numbers 8–17 continue from here. Section 7 (Extensible SCM Architecture) was inserted above.

### 7.1 Secrets at Rest (Database)

| Control | Implementation |
|---------|---------------|
| **Encryption algorithm** | AES-256-GCM (authenticated encryption) |
| **Key derivation** | HKDF-SHA256 from `BACKEND_SECRET` env var with a fixed salt per installation |
| **What's encrypted** | All `portal_config` rows where `is_secret = true` (tokens, client secrets, private keys) |
| **Ciphertext format** | `enc:v1:<base64(iv + ciphertext + authTag)>` — versioned prefix for future algorithm migration |
| **Key rotation** | Re-encrypt all secrets when `BACKEND_SECRET` changes (migration utility provided) |
| **Database access** | PostgreSQL user has least-privilege (SELECT/INSERT/UPDATE on `portal_*` tables only) |

### 7.2 Secrets in Transit (Network)

| Control | Implementation |
|---------|---------------|
| **Transport encryption** | All API calls over HTTPS (TLS 1.2+). Enforced by RHDH's ingress/route configuration. |
| **Request body** | Secrets sent in JSON POST/PUT body (not URL params or headers) to avoid logging exposure |
| **Response masking** | GET endpoints NEVER return plaintext secrets. Secrets returned as `"********"` or `null`. Presence indicated by a boolean field (e.g., `"hasToken": true`) |
| **Audit logging** | Secret write operations logged with actor identity but without secret values |
| **CORS** | Inherits RHDH's CORS policy — same-origin requests only |
| **CSRF protection** | Backstage's built-in token-based auth (`Authorization: Bearer <backstage-token>`) prevents CSRF |

### 7.3 Input Validation & Sanitization

| Control | Implementation |
|---------|---------------|
| **URL validation** | Controller URL and Provider URL validated as proper HTTPS URLs (reject `javascript:`, `data:`, relative URLs) |
| **Token format** | PATs and secrets validated for minimum length, reject empty strings |
| **SQL injection** | Knex.js parameterized queries used exclusively (no raw SQL string interpolation) |
| **XSS prevention** | React's default JSX escaping. No `dangerouslySetInnerHTML`. User-provided values never rendered as HTML. |
| **Request size** | Body size limited to existing `10mb` Backstage default. Config payloads are small (<1KB). |
| **Rate limiting** | Setup APIs limited to authenticated admin users; POST /setup/apply is idempotent |

### 7.4 Authentication & Authorization

| Control | Implementation |
|---------|---------------|
| **Setup mode auth** | Local admin credentials (bcrypt-hashed password stored in K8s secret / config file) |
| **Post-setup auth** | AAP OAuth / SCM OAuth via Backstage auth framework |
| **Authorization** | All admin APIs gated by `permissions.authorize()` checks (following RHDH extensions plugin pattern) |
| **Setup lockout** | Setup APIs (`POST /setup/*`) return 403 after setup is complete unless caller has admin RBAC role |
| **Session handling** | Backstage JWT tokens with configurable signing key. Tokens invalidated on logout. |

### 7.5 Secret Lifecycle

```
Creation:  User input → HTTPS → Backend validates → encrypt(value, BACKEND_SECRET) → DB
Read:      DB → decrypt(value, BACKEND_SECRET) → used internally by ConfigSource → NEVER returned to frontend
Update:    Same as creation (old ciphertext overwritten)
Deletion:  Row deleted from portal_config → no soft delete for secrets
Frontend:  GET /connections → returns { "hasClientSecret": true, "clientSecret": "********" }
```

## 8. Data Model

### 8.1 Database Tables

Migrations follow the RHDH plugin pattern (Knex.js, timestamped migration files):

```sql
-- Setup state and general settings
CREATE TABLE portal_setup (
  id INTEGER PRIMARY KEY DEFAULT 1,
  setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
  local_admin_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Configuration key-value store
CREATE TABLE portal_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- SERIAL for PostgreSQL
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,            -- Encrypted for sensitive values (enc:v1:...)
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT NOT NULL,                -- 'aap', 'registries', 'scm_github', 'scm_gitlab'
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 8.2 Config Key Mapping

The `portal_config` table stores values that map to Backstage config paths. The `DatabaseConfigSource` reads these on startup and builds the config tree.

| Category | config_key | Maps to Backstage Config Path | Secret? |
|----------|-----------|-------------------------------|---------|
| `aap` | `aap.controller_url` | `ansible.rhaap.baseUrl` AND `auth.providers.rhaap.<env>.host` | No |
| `aap` | `aap.admin_token` | `ansible.rhaap.token` | Yes |
| `aap` | `aap.oauth_client_id` | `auth.providers.rhaap.<env>.clientId` | No |
| `aap` | `aap.oauth_client_secret` | `auth.providers.rhaap.<env>.clientSecret` | Yes |
| `aap` | `aap.check_ssl` | `ansible.rhaap.checkSSL` AND `auth.providers.rhaap.<env>.checkSSL` | No |
| `registries` | `registries.pah_enabled` | Controls PAH collection provider scheduling | No |
| `registries` | `registries.pah_inherit_aap` | Whether PAH uses AAP connection details | No |
| `registries` | `registries.pah_url` | PAH standalone URL (when not inherited) | No |
| `registries` | `registries.pah_token` | PAH standalone token (when not inherited) | Yes |
| `registries` | `registries.certified_content` | Enables certified content provider | No |
| `registries` | `registries.validated_content` | Enables validated content provider | No |
| `registries` | `registries.galaxy_enabled` | Enables Ansible Galaxy provider | No |
| `scm_github` | `scm.github.provider_url` | `integrations.github[0].host` | No |
| `scm_github` | `scm.github.api_base_url` | `integrations.github[0].apiBaseUrl` | No |
| `scm_github` | `scm.github.token` | `integrations.github[0].token` | Yes |
| `scm_github` | `scm.github.target_orgs` | `catalog.providers.rhaap.<env>.sync.ansibleGitContents.providers.github[0].orgs` | No |
| `scm_github` | `scm.github.ee_filename` | Discovery EE filename config | No |
| `scm_github` | `scm.github.branches` | Discovery branches config | No |
| `scm_github` | `scm.github.max_depth` | Discovery crawl depth config | No |
| `scm_github` | `scm.github.oauth_client_id` | `auth.providers.github.<env>.clientId` | No |
| `scm_github` | `scm.github.oauth_client_secret` | `auth.providers.github.<env>.clientSecret` | Yes |
| `scm_gitlab` | `scm.gitlab.provider_url` | `integrations.gitlab[0].host` | No |
| `scm_gitlab` | `scm.gitlab.api_base_url` | `integrations.gitlab[0].apiBaseUrl` | No |
| `scm_gitlab` | `scm.gitlab.token` | `integrations.gitlab[0].token` | Yes |
| `scm_gitlab` | `scm.gitlab.target_orgs` | `catalog.providers.rhaap.<env>.sync.ansibleGitContents.providers.gitlab[0].orgs` | No |
| `scm_gitlab` | `scm.gitlab.ee_filename` | Discovery EE filename config | No |
| `scm_gitlab` | `scm.gitlab.branches` | Discovery branches config | No |
| `scm_gitlab` | `scm.gitlab.max_depth` | Discovery crawl depth config | No |
| `scm_gitlab` | `scm.gitlab.oauth_client_id` | `auth.providers.gitlab.<env>.clientId` | No |
| `scm_gitlab` | `scm.gitlab.oauth_client_secret` | `auth.providers.gitlab.<env>.clientSecret` | Yes |

**Extensible pattern**: Any future SCM provider (e.g., Bitbucket) follows the same `scm_<provider>` category convention with keys like `scm.bitbucket.provider_url`, `scm.bitbucket.token`, etc. The `DatabaseConfigSource` config tree builder handles the mapping generically via the `SCMProviderDescriptor.configMapping` structure defined in Section 7.2.

## 9. Configuration Merging Strategy

### 9.1 Backstage Config System Internals (Based on Source Analysis)

From analysis of `@backstage/config-loader` (`packages/config-loader/src/sources/`):

- **`ConfigSource`** is an async-generator interface: `readConfigData()` yields `{ configs: ConfigSourceData[] }`.
- **`MergedConfigSource`** combines multiple sources — later sources override earlier ones.
- **`MutableConfigSource`** allows runtime updates via `setData()`.
- **`ConfigSources.default()`** creates sources from CLI args, files, env vars.
- **`ConfigSources.toConfig(source)`** creates an `ObservableConfigProxy` that subscribes to the generator.

From analysis of `@backstage/backend-defaults` (`rootConfigServiceFactory.ts`):

- Config is created **once** during backend startup and registered as a singleton service.
- RHDH supports `ENABLE_ROOT_CONFIG_OVERRIDE=true` to allow overriding the `rootConfig` service factory.

From analysis of `@backstage/plugin-auth-node` (`createOAuthProviderFactory.ts`):

- **`authenticator.initialize()`** is called **once per auth provider** at startup.
- The returned authenticator context is **cached for the lifetime of the process**.
- There is **no mechanism** to re-initialize auth providers without a restart.

### 9.2 Solution: Custom `DatabaseConfigSource`

We implement a custom `ConfigSource` that reads from the `portal_config` database table at backend startup:

```typescript
// Implements Backstage's ConfigSource interface
export class DatabaseConfigSource implements ConfigSource {
  async *readConfigData(): AsyncConfigSourceGenerator {
    // 1. Connect to database using Knex (same DB as Backstage)
    // 2. Read all portal_config rows
    // 3. Decrypt secret values
    // 4. Build config tree object from flat key-value pairs
    // 5. Yield as ConfigSourceData
    const data = await this.buildConfigTree();
    yield { configs: [{ data, context: 'portal-admin-database' }] };
  }
}
```

### 9.3 Integration Point: Root Config Service Override

RHDH provides `ENABLE_ROOT_CONFIG_OVERRIDE=true` which allows us to register a custom `rootConfig` service factory. Our backend module overrides it to:

1. Call `ConfigSources.default()` for the standard file/env config
2. Create `DatabaseConfigSource` from the portal_config table
3. Merge them via `MergedConfigSource.from([defaultSource, dbSource])` — DB overrides file
4. Return via `ConfigSources.toConfig(mergedSource)`

This means **all plugins** (including community GitHub/GitLab integrations and auth providers) see the merged config — completely transparent.

### 9.4 Config Merge Order

```
app-config.yaml (base, static, from Helm chart ConfigMap)
  ↓ overridden by
Environment variables (APP_CONFIG_* pattern)
  ↓ overridden by
Database config (portal_config table, loaded by DatabaseConfigSource)
  = Final Config (what all plugins receive via coreServices.rootConfig)
```

### 9.5 Why Restart is Required

| Reason | Detail |
|--------|--------|
| **Auth providers** | `createOAuthAuthenticator.initialize()` caches OAuth2Strategy with host/clientId/clientSecret. No re-init mechanism exists. |
| **SCM integrations** | `@backstage/integration` creates `ScmIntegrations` from config at construction time. Cached singleton. |
| **Config service** | `rootConfig` is a singleton service created once during backend startup. |

**Decision**: "Apply & Restart Portal" saves config to DB, then triggers a deployment-appropriate restart (see Section 3A.4):
- **OpenShift**: Backend patches deployment annotation → K8s rollout restart → config loaded from DB on new pod
- **RHEL Appliance**: Backend exits gracefully (`process.exit(0)`) → systemd `Restart=always` restarts the container → config loaded from DB
- **Local Development**: Frontend shows "Please restart the backend manually"

For the RHAAP auth provider specifically, we modify `authenticator.ts` to read config from DB dynamically (Section 3A.6), which means AAP login works immediately after config save without restart. Community SCM auth providers still require restart.

### 9.6 Local Development Considerations

- `better-sqlite3` with `:memory:` connection loses data on restart.
- **Recommendation**: Use file-based SQLite for local dev (`connection: './portal-dev.sqlite3'`) so config survives restarts.
- Alternatively, continue using `app-config.local.yaml` for local development — the setup wizard is primarily a production feature.

## 10. API Specification

All APIs follow REST conventions. Every endpoint that modifies state is idempotent (safe to retry). This enables both UI-driven setup and config-as-code automation.

### 10.1 Setup APIs

```
GET  /api/rhaap-backend/setup/status
  Auth: None (public — needed for frontend to determine login flow)
  → 200: { setupComplete: boolean, localAdminEnabled: boolean }

POST /api/rhaap-backend/setup/aap
  Auth: Required (local admin or RBAC admin)
  Body: {
    controllerUrl: string,     // Required. HTTPS URL of AAP Controller
    adminToken: string,        // Required. AAP Personal Access Token
    clientId: string,          // Required. OAuth Client ID
    clientSecret: string,      // Required. OAuth Client Secret
    checkSSL?: boolean         // Optional. Default: true
  }
  → 200: { success: true }
  → 400: { error: "Validation error details" }
  → 403: { error: "Setup already complete" } (if setup done and caller not admin)

POST /api/rhaap-backend/setup/registries
  Auth: Required
  Body: {
    pahEnabled: boolean,
    pahInheritAap: boolean,
    pahUrl?: string,           // Required if pahEnabled && !pahInheritAap
    pahToken?: string,         // Required if pahEnabled && !pahInheritAap
    certifiedContent: boolean,
    validatedContent: boolean,
    galaxyEnabled: boolean
  }
  → 200: { success: true }

POST /api/rhaap-backend/setup/scm/:provider
  Auth: Required
  Params: provider = "github" | "gitlab"
  Body: {
    providerUrl: string,       // Required. e.g., "https://github.com"
    token: string,             // Required. Service account PAT
    targetOrgs?: string,       // Comma-separated org names
    eeFilename?: string,       // Default: "execution-environment.yml"
    branches?: string,         // Default: "main"
    maxDepth?: number,         // Default: 5
    oauthClientId?: string,    // For user SSO login
    oauthClientSecret?: string // For user SSO login
  }
  → 200: { success: true }

DELETE /api/rhaap-backend/setup/scm/:provider
  Auth: Required
  → 200: { success: true }

POST /api/rhaap-backend/setup/apply
  Auth: Required
  → 200: { success: true, message: "Configuration applied. Restart required." }
  → 400: { error: "AAP configuration is required before applying" }
  Side effects:
    - Validates minimum required config (AAP connection)
    - Sets portal_setup.setup_complete = true
    - Sets portal_setup.local_admin_enabled = false

POST /api/rhaap-backend/setup/batch
  Auth: Required (local admin or RBAC admin)
  Body: { aap: {...}, registries?: {...}, scm?: { github?: {...}, gitlab?: {...} }, apply?: boolean }
  → 200: { success: true, applied: boolean }
  → 400: { error: "Validation errors", details: [...] }
  Note: Atomic — all-or-nothing. If any section fails validation, nothing is saved.
```

### 10.2 Admin APIs (Post-Setup)

```
GET  /api/rhaap-backend/connections
  Auth: Required (RBAC admin)
  → 200: {
      aap: {
        controllerUrl: "https://...",
        hasAdminToken: true,           // Never returns actual token
        clientId: "...",
        hasClientSecret: true,
        checkSSL: true
      },
      registries: { pahEnabled: true, pahInheritAap: true, ... },
      scm: {
        github: {
          configured: true,
          providerUrl: "https://github.com",
          hasToken: true,
          targetOrgs: "my-org",
          hasSsoConfigured: true,
          ...
        },
        gitlab: { configured: false }
      }
    }

PUT  /api/rhaap-backend/connections/aap
  Auth: Required (RBAC admin)
  Body: (same schema as POST /setup/aap)
  → 200: { success: true, restartRequired: true }

PUT  /api/rhaap-backend/connections/registries
  Auth: Required (RBAC admin)
  Body: (same schema as POST /setup/registries)
  → 200: { success: true }

PUT  /api/rhaap-backend/connections/scm/:provider
  Auth: Required (RBAC admin)
  Body: (same schema as POST /setup/scm/:provider)
  → 200: { success: true, restartRequired: true }

DELETE /api/rhaap-backend/connections/scm/:provider
  Auth: Required (RBAC admin)
  → 200: { success: true, restartRequired: true }

PUT  /api/rhaap-backend/general/local-admin
  Auth: Required (RBAC admin)
  Body: { enabled: boolean }
  → 200: { success: true }

POST /api/rhaap-backend/connections/:type/sync
  Auth: Required (RBAC admin)
  Params: type = "aap" | "pah" | "github" | "gitlab"
  → 200: { success: true, message: "Sync triggered" }
  → 404: { error: "Provider not configured" }
```

### 10.3 Config-as-Code: Full Automation Example

```bash
# 1. Get admin credentials (from K8s secret or RHEL config file)
ADMIN_TOKEN=$(kubectl get secret rhaap-portal-admin-credentials -o jsonpath='{.data.password}' | base64 -d)

# 2. Authenticate as local admin
TOKEN=$(curl -s -X POST https://portal.example.com/api/auth/local/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"'$ADMIN_TOKEN'"}' | jq -r '.token')

# 3. Configure AAP
curl -X POST https://portal.example.com/api/rhaap-backend/setup/aap \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "controllerUrl": "https://aap.example.com",
    "adminToken": "my-aap-pat",
    "clientId": "portal-oauth-app",
    "clientSecret": "secret123"
  }'

# 4. Configure registries
curl -X POST https://portal.example.com/api/rhaap-backend/setup/registries \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "pahEnabled": true, "pahInheritAap": true,
    "certifiedContent": true, "validatedContent": true, "galaxyEnabled": true
  }'

# 5. Configure GitHub (optional)
curl -X POST https://portal.example.com/api/rhaap-backend/setup/scm/github \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "providerUrl": "https://github.com",
    "token": "ghp_xxxx",
    "targetOrgs": "my-org",
    "oauthClientId": "Iv1.abc123",
    "oauthClientSecret": "secret456"
  }'

# 6. Apply and finalize
curl -X POST https://portal.example.com/api/rhaap-backend/setup/apply \
  -H "Authorization: Bearer $TOKEN"

# 7. Trigger restart (K8s)
kubectl rollout restart deployment/rhaap-portal
```

### 10.4 Authorization Model

| API Group | During Setup | Post-Setup |
|-----------|-------------|------------|
| `GET /setup/status` | Public (no auth) | Public (no auth) |
| `POST /setup/*` | Local admin only | RBAC admin only |
| `POST /setup/apply` | Local admin only | RBAC admin only |
| `GET /connections` | — | RBAC admin only |
| `PUT /connections/*` | — | RBAC admin only |
| `PUT /general/*` | — | RBAC admin only |
| `POST /connections/*/sync` | — | RBAC admin only |

## 11. OpenAPI Specification & API Contract

### 11.1 Requirement

The `backstage-rhaap-backend` plugin MUST have a formal OpenAPI 3.1 specification that:
1. Documents every REST API endpoint (setup, admin, connections, sync)
2. Lives in the `ansible-backstage-plugins` repository alongside the implementation
3. Is validated against the actual implementation in CI
4. Serves as the source of truth for typed Express routers, client SDKs, and agentic AI integration

### 11.2 Backstage OpenAPI Pattern

Backstage provides `@backstage/backend-openapi-utils` which offers:
- **Typed Express routers** generated from OpenAPI spec — compile-time type safety for request/response shapes
- **Runtime request validation** via `express-openapi-validator` — rejects malformed requests automatically
- **Code generation** via `backstage-cli package schema openapi generate` — generates `openapi.generated.ts` from `openapi.yaml`

### 11.3 Implementation

```
plugins/backstage-rhaap-backend/
├── src/
│   ├── schema/
│   │   ├── openapi.yaml              # OpenAPI 3.1 specification (source of truth)
│   │   └── openapi.generated.ts      # Auto-generated typed router + spec object
│   ├── router.ts                     # Uses createOpenApiRouter() from generated file
│   └── ...
```

**OpenAPI spec location**: `plugins/backstage-rhaap-backend/src/schema/openapi.yaml`

The router MUST use the generated typed router:

```typescript
import { createOpenApiRouter } from './schema/openapi.generated';

export async function createRouter(options: RouterOptions): Promise<Router> {
  const router = await createOpenApiRouter();
  // All routes type-checked against openapi.yaml
  router.get('/setup/status', async (req, res) => { ... });
  router.post('/setup/aap', async (req, res) => { ... });
  return router;
}
```

### 11.4 CI Validation Tooling

The following checks MUST run in CI to ensure the OpenAPI spec matches the implementation:

| Check | Tool | When |
|-------|------|------|
| **Spec-to-code sync** | `backstage-cli package schema openapi generate` | Pre-commit hook + CI. Fails if generated file is out of date. |
| **Request validation** | `express-openapi-validator` (runtime) | Every API request validated against spec. Returns 400 for non-conforming requests. |
| **Response validation** | `@backstage/backend-openapi-utils` test utilities | Unit tests validate response shapes match spec. |
| **Spec lint** | `spectral` or `redocly lint` | CI. Validates OpenAPI spec follows best practices. |
| **Breaking change detection** | `oasdiff` or `openapi-diff` | CI on PR. Detects breaking API changes and requires explicit approval. |

### 11.5 Agentic AI Readiness

The API design follows principles that enable future agentic AI integration (MCP servers, AI assistants, LLM tool-calling):

| Principle | Implementation |
|-----------|---------------|
| **Self-describing** | OpenAPI spec includes detailed `description`, `summary`, and `x-ai-hint` extension fields per operation |
| **Predictable responses** | All responses follow `{ success: boolean, data?: T, error?: string }` envelope pattern |
| **Idempotent mutations** | All POST/PUT endpoints are idempotent — safe for AI agents to retry |
| **Discoverable** | OpenAPI spec served at `/api/rhaap-backend/openapi.json` for runtime discovery |
| **Semantic operation IDs** | Unique `operationId` per operation (e.g., `configureAAP`, `getConnections`, `triggerSync`) |
| **Error taxonomy** | Standard HTTP codes + structured `{ error: string, errorCode: string, details?: any }` body |
| **Batch support** | `POST /setup/batch` accepts full config in one call for atomic setup |

### 11.6 Batch Setup API (Config-as-Code + AI Agents)

In addition to the granular setup APIs (Section 10.1), provide a batch endpoint:

```
POST /api/rhaap-backend/setup/batch
  Auth: Required (local admin or RBAC admin)
  Body: {
    aap: {
      controllerUrl: string,
      adminToken: string,
      clientId: string,
      clientSecret: string,
      checkSSL?: boolean
    },
    registries?: {
      pahEnabled: boolean,
      pahInheritAap: boolean,
      certifiedContent: boolean,
      validatedContent: boolean,
      galaxyEnabled: boolean
    },
    scm?: {
      github?: { providerUrl: string, token: string, ... },
      gitlab?: { providerUrl: string, token: string, ... }
    },
    apply?: boolean   // If true, also marks setup as complete
  }
  → 200: { success: true, applied: boolean }
  → 400: { error: "Validation errors", details: [...] }
```

This enables single-call provisioning from CI/CD pipelines, AI agent tool-calling with one function invocation, and declarative config-as-code.

### 11.7 OpenAPI Spec Availability

The OpenAPI spec MUST be accessible at runtime and in the repository:

| Access Method | Location |
|---------------|----------|
| **Source file** | `plugins/backstage-rhaap-backend/src/schema/openapi.yaml` (committed to git) |
| **Runtime endpoint** | `GET /api/rhaap-backend/openapi.json` |
| **Backstage API Explorer** | Registered as a catalog API entity via `catalog-info.yaml` |

```yaml
# plugins/backstage-rhaap-backend/catalog-info.yaml
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: portal-admin-api
  title: Portal Admin API
  description: Setup and administration API for Ansible Self-Service Automation Portal
spec:
  type: openapi
  lifecycle: production
  owner: ansible-team
  definition:
    $text: ./src/schema/openapi.yaml
```

## 12. Package Structure (Consolidated)

### 12.1 Approach

Instead of creating new frontend/common packages, we extend existing ones and create only one new backend plugin:

| Action | Package | Rationale |
|--------|---------|-----------|
| **NEW** | `plugins/backstage-rhaap-backend` | Generic backend plugin — admin APIs now, extensible later |
| **EXTEND** | `plugins/self-service` | Add setup wizard + admin page components to existing frontend |
| **EXTEND** | `plugins/backstage-rhaap-common` | Add admin types, permissions, constants to existing shared lib |
| **MODIFY** | `plugins/auth-backend-module-rhaap-provider` | DB-backed config hot-reload |

### 12.2 New Backend Plugin: `backstage-rhaap-backend`

```
plugins/backstage-rhaap-backend/
├── package.json                        # role: "backend-plugin", pluginId: "rhaap-backend"
├── config.d.ts                         # Config schema: ansible.portal.*
├── catalog-info.yaml                   # API entity for Backstage catalog
├── migrations/
│   └── 20260324_001_init.ts            # portal_setup + portal_config tables
├── src/
│   ├── index.ts
│   ├── plugin.ts                       # createBackendPlugin('rhaap-backend')
│   ├── router.ts                       # OpenAPI-typed Express router
│   ├── schema/
│   │   ├── openapi.yaml                # OpenAPI 3.1 spec
│   │   └── openapi.generated.ts        # Auto-generated typed router
│   ├── database/
│   │   ├── DatabaseHandler.ts          # Knex CRUD
│   │   └── migrateDb.ts
│   ├── config/
│   │   ├── DatabaseConfigSource.ts     # Implements Backstage ConfigSource
│   │   ├── configTreeBuilder.ts        # Flat key-value → nested config
│   │   ├── encryption.ts              # AES-256-GCM
│   │   └── bootstrapConnection.ts     # Standalone Knex for ConfigSource
│   ├── service/
│   │   ├── PortalAdminService.ts
│   │   └── RestartService.ts
│   └── providers/
│       └── scmProviders.ts            # SCM provider descriptors
```

### 12.3 Frontend Changes: `self-service` Plugin (Existing)

New components added in isolated directories — no changes to existing components:

```
plugins/self-service/src/
├── index.ts                            # Add exports: SetupWizardPage, AdminPages, SetupGate
├── plugin.ts                           # Add extensions
├── routes.ts                           # Add route refs
├── apis.ts                             # Add PortalAdminClient + apiRef
├── components/
│   ├── ... (existing — unchanged)
│   ├── SetupWizard/                    # NEW
│   │   ├── SetupWizard.tsx
│   │   ├── OverviewStep.tsx
│   │   ├── ConnectAAPStep.tsx
│   │   ├── ConnectRegistriesStep.tsx
│   │   ├── ConnectSourceControlStep.tsx
│   │   ├── ConnectSCMModal.tsx
│   │   ├── ReviewStep.tsx
│   │   ├── ApplyingScreen.tsx
│   │   ├── SetupCompleteScreen.tsx
│   │   └── useWizardState.ts
│   ├── AdminPages/                     # NEW
│   │   ├── GeneralPage.tsx
│   │   ├── ConnectionsPage.tsx
│   │   ├── ConnectionCard.tsx
│   │   └── RBACPage.tsx
│   └── SetupGate/                      # NEW
│       └── SetupGate.tsx
├── hooks/                              # NEW
│   ├── useSetupStatus.ts
│   └── usePortalAdminApi.ts
└── providers/                          # NEW
    ├── scmRegistry.ts
    ├── githubProvider.tsx
    └── gitlabProvider.tsx
```

### 12.4 Common Types: `backstage-rhaap-common` (Existing)

```
plugins/backstage-rhaap-common/src/
├── ... (existing — unchanged)
├── admin/                              # NEW directory
│   ├── index.ts
│   ├── types.ts                        # SetupStatus, AAPConfig, SCMConfig, etc.
│   ├── permissions.ts                  # portalAdminReadPermission, portalAdminWritePermission
│   └── constants.ts                    # Config keys, categories, SCM provider IDs
```

## 13. Dynamic Plugin Loading Support

### 13.1 Backend: `backstage-rhaap-backend`

- `package.json`: `"backstage": { "role": "backend-plugin", "pluginId": "rhaap-backend" }`
- `export-dynamic` script for RHDH packaging
- Registered in Helm chart `values.yaml` under `global.dynamic.plugins`

### 13.2 Frontend: Existing `self-service` Plugin

New exports (`SetupWizardPage`, `SetupGate`, `GeneralPage`, etc.) are added to the existing self-service plugin's dynamic plugin config:

```yaml
# values.yaml — update existing self-service plugin entry
ansible.plugin-backstage-self-service:
  # ... existing config unchanged (signInPage, providerSettings, etc.) ...
  dynamicRoutes:
    - importName: LandingPage
      path: /
    - importName: SelfServicePage
      path: /self-service
    - importName: SetupWizardPage              # NEW
      path: /self-service/setup
  mountPoints:
    - mountPoint: application/listener
      importName: LocationListener
    - mountPoint: application/listener         # NEW
      importName: SetupGate
  menuItems:
    # ... existing menu items unchanged ...
    admin.general:                              # NEW
      parent: admin
      title: General
      to: /self-service/admin/general
      icon: settings
    admin.connections:                          # NEW
      parent: admin
      title: Connections
      to: /self-service/admin/connections
      icon: link
    admin.rbac-groups:                          # NEW
      parent: admin
      title: RBAC
      to: /self-service/admin/rbac
      icon: group
```

### 13.3 New Backend Plugin Helm Entry

```yaml
# values.yaml — add new backend plugin
- package: '{{- include "plugins.load.rhaap-backend" . }}'
  disabled: false
```

## 13. Non-Functional Requirements

- **NFR-1**: Setup wizard completable in under 5 minutes by an experienced admin.
- **NFR-2**: Secrets encrypted at rest using AES-256-GCM with versioned ciphertext format.
- **NFR-3**: Setup wizard accessible only to authenticated admin users.
- **NFR-4**: Frontend uses Material-UI v4 components consistent with self-service plugin and RHDH theme.
- **NFR-5**: All new code has >80% test coverage.
- **NFR-6**: Plugins support dynamic plugin loading in RHDH (export-dynamic + Scalprum).
- **NFR-7**: All configuration changes possible via API (config-as-code).
- **NFR-8**: API responses under 500ms for all endpoints.
- **NFR-9**: No plaintext secrets in logs, API responses, or browser-accessible storage.
- **NFR-10**: OpenAPI 3.1 spec committed to repository, CI-validated against implementation.
- **NFR-11**: All API responses use consistent envelope pattern (`{ success, data?, error? }`) for agentic AI compatibility.
- **NFR-12**: Batch API endpoint enables single-call provisioning for CI/CD and AI agents.

## 14. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | On RHEL deployments, should the local admin password be in `/etc/portal/` or printed to stdout on first boot? | **Resolved**: Stored as Podman secret (`portal_admin_password`), displayed during TUI setup and in `portal-status.sh` output. |
| 2 | Should "Apply & Restart Portal" trigger automatic restart? | **Resolved**: Yes — auto-restart per deployment mode. See Section 3A.4. |
| 3 | For the RBAC page (Screen 1), should Portal Role changes use the existing RHDH RBAC plugin APIs or a custom implementation? | **Resolved**: Use existing RHDH RBAC plugin APIs (`@backstage-community/plugin-rbac`). |
| 4 | Should the setup wizard be re-runnable (admin can reset to setup mode from General page)? | **Resolved**: Yes — admin can reset to setup mode from General page. |
| 5 | For local dev, should we default to file-based SQLite (survives restarts) instead of in-memory? | **Resolved**: Yes — use file-based SQLite (e.g., `./portal-dev.sqlite3`) for local dev so config survives restarts. |
| 6 | Should the DatabaseConfigSource support periodic re-reads for hot-reload? | **Resolved**: RHAAP auth reads from DB dynamically (Section 3A.6). DatabaseConfigSource reads once at startup. Registry toggles read by our catalog providers directly. |

## 15. Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@backstage/backend-plugin-api` | ^1.3.1 | Backend module registration, `coreServices` |
| `@backstage/config` | ^1.3.2 | `Config` interface |
| `@backstage/config-loader` | ^1.10.1 | `ConfigSource`, `MergedConfigSource`, `ConfigSources` |
| `@backstage/core-plugin-api` | ^1.10.7 | Frontend plugin APIs |
| `@backstage/plugin-permission-common` | latest | Permission types |
| `@material-ui/core` | ^4.9.13 | UI components |
| `@backstage/backend-openapi-utils` | latest | Typed OpenAPI router, request/response validation |
| `knex` | (via Backstage `coreServices.database`) | Database access |

## 16. Acceptance Criteria

1. A freshly deployed portal boots into setup mode and shows the setup wizard.
2. Admin can complete all 5 steps via UI and submit the configuration.
3. **All setup steps can be completed via API calls** (config-as-code).
4. After setup + restart, AAP OAuth login works without manual secret/configmap editing.
5. SCM connections (GitHub/GitLab) function for content discovery and user SSO.
6. Post-setup admin pages (General, Connections, RBAC) are accessible and functional.
7. Configuration values persist across pod restarts (PostgreSQL).
8. **Secrets are encrypted at rest** and **never returned in plaintext** via API.
9. Community Backstage plugins receive config from the database transparently via `DatabaseConfigSource`.
10. The local admin toggle works for emergency recovery.
11. The feature works as both a static plugin (local dev) and dynamic plugin (RHDH).
12. Config-as-code example works end-to-end in CI/CD pipeline.
13. OpenAPI 3.1 spec is committed, CI validates it matches the implementation.
14. Batch setup API enables single-call provisioning.
15. API is discoverable via `/api/rhaap-backend/openapi.json` and Backstage API Explorer.
