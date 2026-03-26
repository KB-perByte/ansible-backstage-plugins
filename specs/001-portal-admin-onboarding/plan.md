# PLAN: Portal Admin Setup & Onboarding — Architecture & Design

**Jira**: ANSTRAT-1806
**Date**: 2026-03-24
**Prerequisites**: SPEC.md v5 (approved)

---

## 1. Overview

This plan describes how to implement the portal admin setup and onboarding feature. Instead of creating new frontend/common packages, we extend existing ones and create only one new backend plugin.

### 1.1 Guiding Principles

- **Extend, don't duplicate**: Use existing `self-service` (frontend) and `backstage-rhaap-common` (shared types)
- **Generic backend**: New backend plugin named `backstage-rhaap-backend` — serves admin APIs now, extensible for future backend features
- **Minimal package count**: 1 new package, 3 modified packages

## 2. Package Changes

### 2.1 New Package

| Package | Name | Role |
|---------|------|------|
| `plugins/backstage-rhaap-backend` | `@ansible/backstage-rhaap-backend` | Backend plugin — REST API, DB, ConfigSource, encryption, restart logic |

### 2.2 Modified Packages

| Package | Changes |
|---------|---------|
| `plugins/self-service` | Add setup wizard components, admin page components, new routes, new API client, SetupGate extension |
| `plugins/backstage-rhaap-common` | Add admin types (SetupStatus, AAPConfig, SCMConfig, etc.), permissions, config constants |
| `plugins/auth-backend-module-rhaap-provider` | Modify `authenticator.ts` for DB-backed config hot-reload |
| `packages/backend/src/index.ts` | Add `backend.add(import('backstage-rhaap-backend'))` |

### 2.3 Dependency Graph

```
backstage-rhaap-common (existing — add admin types, permissions, constants)
    │
    ├── backstage-rhaap-backend (NEW — depends on common)
    │   ├── DatabaseConfigSource (standalone — no Backstage service deps at init)
    │   ├── PortalAdminService (uses coreServices.database)
    │   └── router.ts (uses coreServices.httpRouter, permissions, auth)
    │
    ├── self-service (existing — add admin UI, depends on common)
    │   ├── SetupWizard components
    │   ├── AdminPages components
    │   ├── SetupGate extension
    │   └── PortalAdminClient (uses discoveryApiRef, fetchApiRef)
    │
    └── auth-backend-module-rhaap-provider (existing — modified, depends on common)
        └── authenticator.ts (reads config from DB with cache)
```

## 3. File Structure

### 3.1 `plugins/backstage-rhaap-backend/` (NEW)

```
plugins/backstage-rhaap-backend/
├── package.json
├── config.d.ts                         # Config schema: ansible.portal.*
├── catalog-info.yaml                   # API entity for Backstage catalog
├── migrations/
│   └── 20260324_001_init.ts            # portal_setup + portal_config tables
├── src/
│   ├── index.ts                        # Exports: plugin, DatabaseConfigSource
│   ├── plugin.ts                       # createBackendPlugin('rhaap-backend')
│   ├── router.ts                       # OpenAPI-typed Express router
│   ├── schema/
│   │   ├── openapi.yaml                # OpenAPI 3.1 spec (source of truth)
│   │   └── openapi.generated.ts        # Auto-generated typed router
│   ├── database/
│   │   ├── DatabaseHandler.ts          # Knex CRUD for portal_setup + portal_config
│   │   └── migrateDb.ts               # Migration runner
│   ├── config/
│   │   ├── DatabaseConfigSource.ts     # Implements Backstage ConfigSource interface
│   │   ├── configTreeBuilder.ts        # Flat key-value → nested Backstage config
│   │   ├── encryption.ts              # AES-256-GCM encrypt/decrypt
│   │   └── bootstrapConnection.ts     # Standalone Knex connection for ConfigSource
│   ├── service/
│   │   ├── PortalAdminService.ts      # Business logic (validation, config mapping)
│   │   └── RestartService.ts          # Deployment-aware restart triggers
│   └── providers/
│       └── scmProviders.ts            # SCM provider descriptors (config mapping)
```

### 3.2 Changes to `plugins/self-service/` (EXISTING)

```
plugins/self-service/src/
├── index.ts                             # Add: SetupWizardPage, AdminPages, SetupGate exports
├── plugin.ts                            # Add: new route extensions + SetupGate component extension
├── routes.ts                            # Add: setupRouteRef, adminGeneralRouteRef, etc.
├── apis.ts                              # Add: portalAdminApiRef, PortalAdminClient
├── components/
│   ├── ... (existing components unchanged)
│   ├── SetupWizard/                     # NEW directory
│   │   ├── SetupWizard.tsx              # Main wizard container + stepper
│   │   ├── OverviewStep.tsx             # Step 1
│   │   ├── ConnectAAPStep.tsx           # Step 2
│   │   ├── ConnectRegistriesStep.tsx    # Step 3
│   │   ├── ConnectSourceControlStep.tsx # Step 4
│   │   ├── ConnectSCMModal.tsx          # GitHub/GitLab connect modal
│   │   ├── ReviewStep.tsx              # Step 5
│   │   ├── ApplyingScreen.tsx          # Loading screen
│   │   ├── SetupCompleteScreen.tsx     # Success screen
│   │   ├── useWizardState.ts           # Wizard state management hook
│   │   └── index.ts
│   ├── AdminPages/                      # NEW directory
│   │   ├── GeneralPage.tsx
│   │   ├── ConnectionsPage.tsx
│   │   ├── ConnectionCard.tsx           # Reusable connection card
│   │   ├── RBACPage.tsx
│   │   └── index.ts
│   ├── SetupGate/                       # NEW directory
│   │   ├── SetupGate.tsx                # Checks setup status, redirects
│   │   └── index.ts
│   └── RouteView/
│       └── RouteView.tsx                # Add admin routes
├── hooks/                               # NEW directory (or add to existing)
│   ├── useSetupStatus.ts
│   └── usePortalAdminApi.ts
└── providers/                           # NEW directory
    ├── scmRegistry.ts                   # Frontend SCM provider registry
    ├── githubProvider.tsx               # GitHub descriptor + icon
    └── gitlabProvider.tsx               # GitLab descriptor + icon
```

### 3.3 Changes to `plugins/backstage-rhaap-common/` (EXISTING)

```
plugins/backstage-rhaap-common/src/
├── index.ts                             # Add: exports for admin types/permissions
├── ... (existing files unchanged)
├── admin/                               # NEW directory
│   ├── index.ts
│   ├── types.ts                         # SetupStatus, AAPConfig, RegistriesConfig, SCMConfig
│   ├── permissions.ts                   # portalAdminReadPermission, portalAdminWritePermission
│   └── constants.ts                     # Config key names, category names, SCM provider IDs
```

## 4. Database Design

### 4.1 Migration: `20260324_001_init.ts`

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('portal_setup', table => {
    table.integer('id').primary().defaultTo(1);
    table.boolean('setup_complete').notNullable().defaultTo(false);
    table.boolean('local_admin_enabled').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });
  await knex('portal_setup').insert({ id: 1 });

  await knex.schema.createTable('portal_config', table => {
    table.increments('id').primary();
    table.text('config_key').notNullable().unique();
    table.text('config_value').notNullable();
    table.boolean('is_secret').notNullable().defaultTo(false);
    table.text('category').notNullable();
    table.timestamps(true, true);
    table.index('category');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('portal_config');
  await knex.schema.dropTableIfExists('portal_setup');
}
```

### 4.2 Local Dev: File-Based SQLite

```yaml
# app-config.local.yaml — change from in-memory to file-based
backend:
  database:
    client: better-sqlite3
    connection: './portal-dev.sqlite3'
```

## 5. DatabaseConfigSource — Core Integration

### 5.1 Chicken-and-Egg Solution

`DatabaseConfigSource` needs a DB connection, but Backstage's `coreServices.database` depends on `coreServices.rootConfig`. We break the cycle by creating a standalone Knex connection that reads DB config directly from the raw `app-config.yaml` files.

```typescript
// config/bootstrapConnection.ts
export async function createBootstrapConnection(
  appConfigPaths: string[],
): Promise<Knex> {
  // 1. Parse app-config.yaml files (raw YAML, no Backstage config system)
  // 2. Extract backend.database.client + backend.database.connection
  // 3. Create standalone Knex instance
  // 4. Run portal_setup + portal_config migrations if needed
  // 5. Return connection
}
```

### 5.2 ConfigSource Implementation

```typescript
// config/DatabaseConfigSource.ts
export class DatabaseConfigSource implements ConfigSource {
  static async create(appConfigPaths: string[]): Promise<DatabaseConfigSource>;

  async *readConfigData(): AsyncGenerator<{ configs: ConfigSourceData[] }> {
    const hasTable = await this.knex.schema.hasTable('portal_config');
    if (!hasTable) { yield { configs: [] }; return; }

    const rows = await this.knex('portal_config').select('*');
    const decrypted = rows.map(r => ({
      ...r,
      config_value: r.is_secret ? decrypt(r.config_value, this.secret) : r.config_value,
    }));
    const tree = buildConfigTree(decrypted);
    yield { configs: tree ? [{ data: tree, context: 'portal-admin-database' }] : [] };
  }
}
```

### 5.3 Config Tree Builder

Transforms flat `portal_config` rows into the nested config structure that Backstage plugins expect:

```
DB rows: [
  { key: 'aap.controller_url', value: 'https://aap.example.com' },
  { key: 'scm.github.token', value: 'ghp_xxx' },
]
    ↓ buildConfigTree()
{
  ansible: { rhaap: { baseUrl: 'https://aap.example.com' } },
  auth: { providers: { rhaap: { production: { host: 'https://aap.example.com' } } } },
  integrations: { github: [{ host: 'github.com', token: 'ghp_xxx' }] },
}
```

Uses the SCM provider descriptors' `configMapping` for generic transformation.

### 5.4 Integration with RHDH

For RHDH dynamic plugin deployment:
1. Set `ENABLE_CORE_ROOTCONFIG_OVERRIDE=true` in deployment env vars
2. The `backstage-rhaap-backend` plugin registers a custom `rootConfig` service factory
3. This factory merges `ConfigSources.default()` + `DatabaseConfigSource` via `MergedConfigSource`

For local dev (static plugin):
- The backend plugin registers itself in `packages/backend/src/index.ts`
- Config override happens via the same mechanism

## 6. Encryption Module

```typescript
// config/encryption.ts — AES-256-GCM with versioned format

export function encrypt(plaintext: string, backendSecret: string): string;
// Returns: 'enc:v1:<base64(iv ∥ ciphertext ∥ authTag)>'

export function decrypt(ciphertext: string, backendSecret: string): string;
// Expects: 'enc:v1:...' prefix

export function isEncrypted(value: string): boolean;
// Key derivation: HKDF-SHA256(backendSecret, salt, info='v1')
```

## 7. RHAAP Auth Module Modification

### 7.1 Current → Modified Flow

```
CURRENT:  initialize() → cache config → authenticate() uses cached config
MODIFIED: initialize() → store static defaults → authenticate() reads DB (60s TTL cache), falls back to static
```

### 7.2 Config Resolution

```typescript
async function resolveConfig(ctx: AuthContext) {
  // 1. Try DB (cached 60s) — portal_config rows with category='aap'
  const dbConfig = await portalConfigCache.get('aap');
  if (dbConfig) return { host: dbConfig.controller_url, clientId: dbConfig.oauth_client_id, ... };

  // 2. Fall back to static config (from app-config.yaml)
  return { host: ctx.staticHost, clientId: ctx.staticClientId, ... };
}
```

**Impact**: AAP auth works immediately after setup wizard saves to DB — no restart needed for AAP. Community SCM auth providers still need restart.

## 8. Admin Permissions

### 8.1 Permission Definitions (in `backstage-rhaap-common`)

```typescript
// plugins/backstage-rhaap-common/src/admin/permissions.ts
import { createPermission } from '@backstage/plugin-permission-common';

export const portalAdminViewPermission = createPermission({
  name: 'ansible.admin.view',
  attributes: { action: 'read' },
});

export const portalAdminWritePermission = createPermission({
  name: 'ansible.admin.write',
  attributes: { action: 'create' },
});

export const portalAdminPermissions = [
  portalAdminViewPermission,
  portalAdminWritePermission,
];
```

### 8.2 Backend Permission Registration (in `backstage-rhaap-backend`)

```typescript
// plugin.ts — register permissions with Backstage framework
import { portalAdminPermissions } from '@ansible/backstage-rhaap-common';

reg.registerInit({
  deps: {
    permissionsRegistry: coreServices.permissionsRegistry,
    // ... other deps
  },
  async init({ permissionsRegistry, ... }) {
    permissionsRegistry.addPermissions(portalAdminPermissions);
    // ... router setup
  },
});
```

### 8.3 Frontend Usage Pattern

Following the existing self-service plugin pattern where `usePermission()` is used in `Home.tsx`, `TemplateCard`, `EmptyState`, etc.:

```typescript
// Route-level (RouteView.tsx)
import { RequirePermission } from '@backstage/plugin-permission-react';
import { portalAdminViewPermission } from '@ansible/backstage-rhaap-common';

<Route path="admin/general" element={
  <RequirePermission permission={portalAdminViewPermission}>
    <GeneralPage />
  </RequirePermission>
} />

// Component-level (ConnectionCard.tsx)
import { usePermission } from '@backstage/plugin-permission-react';
import { portalAdminWritePermission } from '@ansible/backstage-rhaap-common';

const { allowed: canEdit } = usePermission({
  permission: portalAdminWritePermission,
});
// Conditionally render Edit/Sync buttons based on canEdit
```

### 8.4 Sidebar Menu Visibility

ADMINISTRATION menu items are only visible to users with `portalAdminViewPermission`. In dynamic plugin config, this is handled by the RHDH menu system's permission-aware rendering (sidebar items check permissions before rendering).

For static plugin mode, the sidebar wrapper component checks:
```typescript
const { allowed } = usePermission({ permission: portalAdminViewPermission });
if (!allowed) return null;
```

## 8A. Local Admin Auth (Integrated into RHAAP Provider)

### 8A.1 Approach: No New Package

Instead of a separate auth module, extend the existing `auth-backend-module-rhaap-provider` with a `POST /local-login` endpoint. No new packages needed.

**Files to modify:**
- `plugins/auth-backend-module-rhaap-provider/src/module.ts` — Register local-login route
- `plugins/auth-backend-module-rhaap-provider/src/localAdmin.ts` — New file: bcrypt validation + rate limiting
- `plugins/self-service/src/components/SignInPage/SignInPage.tsx` — Conditional local admin form

### 8A.2 Local Login Endpoint

Added to the RHAAP auth provider's router alongside the existing OAuth endpoints:

```typescript
// localAdmin.ts — added to the auth module's router
router.post('/local-login', async (req, res) => {
  // 1. Check if local admin is enabled (read portal_setup from DB)
  // 2. Rate limit check (5 attempts/min)
  // 3. Validate username === 'admin'
  // 4. bcrypt.compare(password, PORTAL_ADMIN_PASSWORD_HASH env var)
  //    OR direct compare with ansible.portal.admin.password config (dev)
  // 5. Issue Backstage identity token for user:default/admin
  // 6. Audit log the attempt
});
```

### 8A.3 Secret Injection per Deployment

**RHEL** — follows existing `create_portal_secret()` pattern in `lib/common.sh`:
```
portal-setup.py → create_portal_secret("ADMIN_PASSWORD_HASH", bcrypt_hash)
portal.container → Secret=portal_admin_password_hash,type=env,target=PORTAL_ADMIN_PASSWORD_HASH
```

**OpenShift** — new Helm pre-install hook:
```yaml
# templates/admin-credentials.yaml (pre-install hook)
apiVersion: batch/v1
kind: Job
...
# Generates password + bcrypt hash → creates K8s Secret
# values.yaml extraEnvVars: PORTAL_ADMIN_PASSWORD_HASH from secretKeyRef
```

**Local dev** — plain password in config:
```yaml
ansible:
  portal:
    admin:
      password: admin123
```

## 9. Frontend Integration into Self-Service Plugin

### 8.1 New Routes

```typescript
// routes.ts — add to existing file
export const setupRouteRef = createSubRouteRef({
  id: 'self-service/setup',
  parent: rootRouteRef,
  path: '/setup',
});

export const adminGeneralRouteRef = createSubRouteRef({
  id: 'self-service/admin/general',
  parent: rootRouteRef,
  path: '/admin/general',
});

export const adminConnectionsRouteRef = createSubRouteRef({
  id: 'self-service/admin/connections',
  parent: rootRouteRef,
  path: '/admin/connections',
});

export const adminRbacRouteRef = createSubRouteRef({
  id: 'self-service/admin/rbac',
  parent: rootRouteRef,
  path: '/admin/rbac',
});
```

### 8.2 RouteView Changes

```typescript
// RouteView.tsx — add admin routes
<Routes>
  {/* ... existing routes ... */}

  {/* Setup wizard */}
  <Route path="setup" element={<SetupWizard />} />

  {/* Admin pages (permission-gated) */}
  <Route path="admin/general" element={
    <RequirePermission permission={portalAdminReadPermission}>
      <GeneralPage />
    </RequirePermission>
  } />
  <Route path="admin/connections" element={
    <RequirePermission permission={portalAdminReadPermission}>
      <ConnectionsPage />
    </RequirePermission>
  } />
  <Route path="admin/rbac" element={
    <RequirePermission permission={portalAdminReadPermission}>
      <RBACPage />
    </RequirePermission>
  } />
</Routes>
```

### 8.3 New Plugin Exports

```typescript
// index.ts — add new exports to existing file
export { SetupWizard } from './components/SetupWizard';
export { SetupWizardPage } from './plugin'; // Routable extension for dynamic plugin
export { GeneralPage } from './components/AdminPages/GeneralPage';
export { ConnectionsPage } from './components/AdminPages/ConnectionsPage';
export { RBACPage } from './components/AdminPages/RBACPage';
export { SetupGate } from './components/SetupGate';
```

### 8.4 Plugin Extensions

```typescript
// plugin.ts — add to existing plugin
export const SetupWizardPage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'SetupWizardPage',
    component: () => import('./components/SetupWizard').then(m => m.SetupWizard),
    mountPoint: setupRouteRef,
  }),
);

export const SetupGate = selfServicePlugin.provide(
  createComponentExtension({
    name: 'SetupGate',
    component: {
      lazy: () => import('./components/SetupGate').then(m => m.SetupGate),
    },
  }),
);
```

### 8.5 API Client Addition

```typescript
// apis.ts — add PortalAdminClient alongside existing AnsibleApiClient
export interface PortalAdminApi {
  getSetupStatus(): Promise<SetupStatus>;
  saveAAPConfig(config: AAPConfig): Promise<void>;
  saveRegistriesConfig(config: RegistriesConfig): Promise<void>;
  saveSCMConfig(provider: string, config: SCMConfig): Promise<void>;
  deleteSCMConfig(provider: string): Promise<void>;
  applySetup(): Promise<{ triggered: boolean; mode: string }>;
  batchSetup(config: BatchSetupConfig): Promise<void>;
  getConnections(): Promise<ConnectionsResponse>;
  updateConnection(type: string, config: any): Promise<void>;
  triggerSync(type: string): Promise<void>;
  setLocalAdmin(enabled: boolean): Promise<void>;
}

export const portalAdminApiRef = createApiRef<PortalAdminApi>({
  id: 'portal-admin',
});
```

### 8.6 Dynamic Plugin Config (Helm)

```yaml
# values.yaml — update existing self-service plugin config
ansible.plugin-backstage-self-service:
  # ... existing config (signInPage, providerSettings, etc.) ...
  dynamicRoutes:
    - importName: LandingPage
      path: /
    - importName: SelfServicePage
      path: /self-service
    - importName: SetupWizardPage         # NEW
      path: /self-service/setup
  mountPoints:
    - mountPoint: application/listener
      importName: LocationListener
    - mountPoint: application/listener     # NEW
      importName: SetupGate
  menuItems:
    # ... existing menu items ...
    admin.general:                          # NEW
      parent: admin
      title: General
      to: /self-service/admin/general
      icon: settings
    admin.connections:                      # NEW
      parent: admin
      title: Connections
      to: /self-service/admin/connections
      icon: link
    admin.rbac-groups:                      # NEW
      parent: admin
      title: RBAC
      to: /self-service/admin/rbac
      icon: group
```

## 9. Restart Service

### 9.1 Security Principle: No Shell Execution

The backend MUST NOT call `execFile`, `exec`, or spawn shell processes. Reasons:
- On RHEL, the backend runs inside a Podman container with no access to host systemd
- Shell execution from a web-facing process is a privilege escalation vector
- Mounting host systemd sockets into the container would enable container escape

Instead, the backend uses **graceful self-exit** — the process exits cleanly and the orchestrator (systemd / Kubernetes) restarts it automatically.

### 9.2 Deployment Detection

```typescript
export type DeploymentMode = 'openshift' | 'rhel' | 'local';

export function detectDeploymentMode(): DeploymentMode {
  if (fs.existsSync('/etc/portal/.portal.env')) return 'rhel';
  if (process.env.KUBERNETES_SERVICE_HOST) return 'openshift';
  return 'local';
}
```

### 9.3 Restart Triggers

```typescript
export class RestartService {
  async triggerRestart(): Promise<{ triggered: boolean; mode: DeploymentMode }> {
    const mode = detectDeploymentMode();

    switch (mode) {
      case 'openshift':
        try {
          // Preferred: K8s rolling restart (zero-downtime)
          await this.patchDeploymentAnnotation();
        } catch (err) {
          // Fallback: graceful exit — K8s restartPolicy: Always restarts the pod
          this.logger.warn('K8s API patch failed, falling back to process exit', err);
          this.scheduleGracefulExit();
        }
        return { triggered: true, mode };

      case 'rhel':
        // Graceful exit — systemd Restart=always restarts the container
        this.scheduleGracefulExit();
        return { triggered: true, mode };

      case 'local':
        // Cannot auto-restart in dev mode
        return { triggered: false, mode };
    }
  }

  private scheduleGracefulExit() {
    // Delay to let the HTTP response flush to the client
    setTimeout(() => {
      this.logger.info('Exiting for restart — orchestrator will restart the service');
      process.exit(0);
    }, 2000);
  }
}
```

### 9.4 OpenShift: `patchDeploymentAnnotation()`

Patches the portal's own Deployment via K8s API using the mounted service account token. This is exactly what `kubectl rollout restart` does — a zero-downtime rolling restart.

```typescript
private async patchDeploymentAnnotation() {
  const namespace = fs.readFileSync(
    '/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8',
  ).trim();
  const token = fs.readFileSync(
    '/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf8',
  ).trim();
  const ca = fs.readFileSync(
    '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
  );
  const deploymentName = process.env.DEPLOYMENT_NAME ?? 'rhaap-portal';

  const response = await fetch(
    `https://kubernetes.default.svc/apis/apps/v1/namespaces/${namespace}/deployments/${deploymentName}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        spec: {
          template: {
            metadata: {
              annotations: {
                'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
              },
            },
          },
        },
      }),
      agent: new https.Agent({ ca }),
    },
  );
  if (!response.ok) {
    throw new Error(`K8s restart failed: ${response.status}`);
  }
}
```

**Helm chart RBAC** — Added as a template in `ansible-portal-chart` (no extra user steps; deployed automatically with `helm install`):

```yaml
# ansible-portal-chart/templates/restart-rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ include "janus-idp.name" . }}-restart
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    resourceNames: ["{{ include "janus-idp.name" . }}"]
    verbs: ["get", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ include "janus-idp.name" . }}-restart
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ include "janus-idp.name" . }}-restart
subjects:
  - kind: ServiceAccount
    name: {{ include "janus-idp.name" . }}
```

The Role is scoped to only the portal's own Deployment (`resourceNames`) with only `get` and `patch` verbs — least privilege.

### 9.5 RHEL Appliance: Graceful Exit + systemd Restart

No scripts or shell execution needed. The portal Quadlet already has `Restart=always`:

```
# containers/portal.container (existing in bootc image)
[Service]
Restart=always
```

When the backend calls `process.exit(0)`:
1. Node.js process exits cleanly
2. Podman container exits
3. systemd detects the exit and restarts the container
4. New container boots → `DatabaseConfigSource` reads fresh config from PostgreSQL
5. AAP OAuth is now active

### 9.6 Frontend Restart Handling

Since restart kills the backend process, the frontend cannot wait for a response:

```
1. Frontend calls POST /setup/apply → 200 { success: true, restartTriggered: true }
2. Backend saves config, marks setup complete, sends response
3. Backend schedules graceful exit (2s delay to flush response)
4. Frontend shows "Applying configuration..." screen
5. Frontend polls GET /setup/status every 2 seconds
6. Requests fail during restart (expected) — frontend keeps polling
7. When backend comes back healthy → "System Configured & Ready"
8. If no response after 90 seconds → "Restart may require manual intervention"
```

### 9.7 Restart Strategy Summary

| Deployment | Mechanism | How It Works | Security |
|------------|-----------|-------------|----------|
| **OpenShift** | K8s API patch → rolling restart | Patches deployment annotation, K8s creates new pod | No exec, uses SA token with scoped RBAC |
| **OpenShift** (fallback) | `process.exit(0)` | Pod exits, K8s `restartPolicy: Always` restarts | No exec, no privilege needed |
| **RHEL** | `process.exit(0)` | Container exits, systemd `Restart=always` restarts | No exec, no host access, no socket mounting |
| **Local** | Manual | Frontend shows "Please restart the backend" | N/A |
```

## 10. Implementation Phases

### Phase 1: Foundation (Backend + Common Types)
**Deliverable**: Backend plugin with DB, encryption, APIs, OpenAPI spec

1. Add admin types, permissions, constants to `backstage-rhaap-common`
2. Scaffold `backstage-rhaap-backend` plugin
3. Write OpenAPI 3.1 spec (`openapi.yaml`)
4. Generate typed router
5. Implement DB migration + `DatabaseHandler`
6. Implement encryption module
7. Implement `PortalAdminService` (setup + admin APIs)
8. Implement router with authorization
9. Register in `packages/backend/src/index.ts`
10. Unit tests (>80%)

### Phase 2: Config Merging
**Deliverable**: DB config available to all plugins via standard Config

1. Implement `bootstrapConnection.ts`
2. Implement `configTreeBuilder.ts`
3. Implement `DatabaseConfigSource`
4. Integrate with backend startup (rootConfig override)
5. Modify `authenticator.ts` in auth module for hot-reload
6. Integration tests

### Phase 3: Setup Wizard (Frontend)
**Deliverable**: 5-step wizard in self-service plugin

1. Add API client (`PortalAdminClient`) to `self-service/src/apis.ts`
2. Add routes to `self-service/src/routes.ts`
3. Implement `SetupGate` component
4. Implement `SetupWizard` with stepper
5. Implement each step (Overview, AAP, Registries, SCM, Review)
6. Implement `ConnectSCMModal` with provider registry
7. Implement `ApplyingScreen` + `SetupCompleteScreen`
8. Add routes to `RouteView.tsx`
9. Add exports to `index.ts` + `plugin.ts`
10. Component tests

### Phase 4: Admin Pages (Frontend)
**Deliverable**: General, Connections, RBAC pages

1. Implement `GeneralPage` (local admin toggle)
2. Implement `ConnectionsPage` (cards with Edit/Sync)
3. Implement `ConnectionCard` (reusable)
4. Implement `RBACPage` (wrapping RHDH RBAC plugin APIs)
5. Add permission-gated routes to `RouteView.tsx`
6. Update dynamic plugin config for sidebar menu items
7. Component tests

### Phase 5: Deployment Integration
**Deliverable**: End-to-end on OpenShift + RHEL

1. Implement `RestartService` (graceful exit + K8s API patch)
2. Add Helm chart RBAC template for restart permissions
3. Update Helm chart `values.yaml`
4. Update RHEL `app-config.yaml` with `onboarding.enabled: true`
5. Add `ENABLE_CORE_ROOTCONFIG_OVERRIDE=true` env var
6. K8s RBAC for ServiceAccount
7. Dynamic plugin export + packaging
8. E2E tests

### Phase 6: Polish
**Deliverable**: Production-ready

1. CI: OpenAPI lint, breaking change detection
2. Batch API (`POST /setup/batch`)
3. Config-as-code docs + examples
4. Catalog API entity
5. E2E test coverage
6. Performance validation

### Phase 7: Local Admin Auth + Recovery
**Deliverable**: Custom auth provider for setup/recovery, conditional sign-in page

1. Scaffold `auth-backend-module-local-admin-provider` package
2. Implement bcrypt-based authenticator (username/password validation)
3. Implement sign-in resolver (maps to `user:default/admin`)
4. Register module in `packages/backend/src/index.ts`
5. Update sign-in page to conditionally show "Local Admin" option based on `localAdminEnabled`
6. Add password hash generation to Helm chart (K8s Secret in NOTES.txt)
7. Add password hash generation to RHEL bootc (`portal-setup.py`)
8. Update `portal-config.sh` with `LOCAL_ADMIN_ENABLED` and `ADMIN_PASSWORD` commands
9. Rate limiting for local admin login (5 attempts/min)
10. Audit logging for local admin auth events
11. Unit tests + E2E tests for local admin flow
12. Remove guest auth dependency for setup mode

## 11. Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Backend unit | Jest + supertest | Service, router, encryption, DB handler, config tree builder |
| Frontend unit | Jest + RTL | Each wizard step, admin page, hooks, API client |
| Integration | Jest + real SQLite | DatabaseConfigSource end-to-end, auth hot-reload |
| API contract | `@backstage/backend-openapi-utils` | All endpoints match OpenAPI spec |
| E2E | Playwright | Full setup wizard flow, admin pages |

## 12. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Circular dep**: ConfigSource needs DB config | Bootstrap connection parses app-config.yaml directly |
| **Auth cold start**: No DB config on first boot | `resolveConfig()` falls back to static config; local admin used during setup |
| **Community plugin compat**: DB config format mismatch | Config tree builder tested against exact paths from community plugin source |
| **Restart failure**: K8s/systemctl fails | Frontend handles gracefully — shows manual instructions |
| **Self-service plugin bloat** | New components in isolated directories (`SetupWizard/`, `AdminPages/`, `SetupGate/`); no changes to existing components |
| **Dynamic plugin config** | New exports added alongside existing ones; backward-compatible |
