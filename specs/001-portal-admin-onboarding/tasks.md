# TASKS: Portal Admin Setup & Onboarding — Task Breakdown

**Jira**: ANSTRAT-1806
**Date**: 2026-03-24
**Prerequisites**: SPEC.md v6, PLAN.md (approved)

---

## Phase 1: Foundation (Backend Core)

**Goal**: Backend plugin with DB, encryption, APIs, and OpenAPI spec

### T1.1 — Add admin types, permissions, and constants to `backstage-rhaap-common`

**Files to create/modify**:
- `plugins/backstage-rhaap-common/src/admin/types.ts` (create)
- `plugins/backstage-rhaap-common/src/admin/permissions.ts` (create)
- `plugins/backstage-rhaap-common/src/admin/constants.ts` (create)
- `plugins/backstage-rhaap-common/src/admin/index.ts` (create)
- `plugins/backstage-rhaap-common/src/index.ts` (modify — add `export * from './admin'`)

**Types to define**:
- `SetupStatus` — `{ onboardingEnabled, setupComplete, localAdminEnabled, deploymentMode }`
- `AAPConfig` — `{ controllerUrl, adminToken, clientId, clientSecret, checkSSL }`
- `RegistriesConfig` — `{ pahEnabled, pahInheritAap, pahUrl?, pahToken?, certifiedContent, validatedContent, galaxyEnabled }`
- `SCMConfig` — `{ providerUrl, token, targetOrgs?, eeFilename?, branches?, maxDepth?, oauthClientId?, oauthClientSecret? }`
- `BatchSetupConfig` — `{ aap, registries?, scm?, apply? }`
- `ConnectionsResponse` — response shape for GET /connections
- `SCMProviderDescriptor` — extensible SCM provider definition

**Permissions to define** (using `createPermission` from `@backstage/plugin-permission-common`):
- `portalAdminViewPermission` — ID: `ansible.admin.view`, action: `read` — view admin pages, see ADMINISTRATION sidebar
- `portalAdminWritePermission` — ID: `ansible.admin.write`, action: `create` — modify settings, edit connections, trigger sync, run setup wizard
- `portalAdminPermissions` array — exported for backend registration via `permissionsRegistry.addPermissions()`

**Pattern reference**: Follows same `usePermission()` / `RequirePermission` pattern used in existing self-service components (`Home.tsx`, `TemplateCard`, `EmptyState.tsx`, `RouteView.tsx`)

**Constants to define**:
- Config key names (`CONFIG_KEYS.AAP_CONTROLLER_URL`, etc.)
- Category names (`CATEGORIES.AAP`, `CATEGORIES.REGISTRIES`, etc.)
- SCM provider IDs (`SCM_PROVIDERS.GITHUB`, `SCM_PROVIDERS.GITLAB`)

**Acceptance criteria**:
- Types compile with `yarn tsc`
- Permissions follow Backstage permission pattern
- Exported from `backstage-rhaap-common` package

**Complexity**: Small
**Dependencies**: None
**Blocked by**: None

---

### T1.2 — Scaffold `backstage-rhaap-backend` plugin package

**Files to create**:
- `plugins/backstage-rhaap-backend/package.json`
- `plugins/backstage-rhaap-backend/tsconfig.json`
- `plugins/backstage-rhaap-backend/config.d.ts`
- `plugins/backstage-rhaap-backend/src/index.ts`
- `plugins/backstage-rhaap-backend/src/plugin.ts`

**package.json key fields**:
```json
{
  "name": "@ansible/backstage-rhaap-backend",
  "backstage": { "role": "backend-plugin", "pluginId": "rhaap-backend" },
  "dependencies": {
    "@ansible/backstage-rhaap-common": "workspace:^",
    "@backstage/backend-plugin-api": "^1.3.1",
    "@backstage/backend-openapi-utils": "latest",
    "@backstage/config": "^1.3.2",
    "@backstage/config-loader": "^1.10.1",
    "@backstage/errors": "^1.2.7"
  }
}
```

**config.d.ts schema**:
```typescript
export interface Config {
  ansible?: {
    portal?: {
      onboarding?: { enabled?: boolean };
    };
  };
}
```

**plugin.ts**: Minimal `createBackendPlugin('rhaap-backend')` with `registerInit()` stub.

**Acceptance criteria**:
- Package builds with `yarn build`
- Plugin registers in `packages/backend/src/index.ts`
- `yarn tsc` passes

**Complexity**: Small
**Dependencies**: T1.1
**Blocked by**: None

---

### T1.3 — Implement database migration and DatabaseHandler

**Files to create**:
- `plugins/backstage-rhaap-backend/migrations/20260324_001_init.ts`
- `plugins/backstage-rhaap-backend/src/database/migrateDb.ts`
- `plugins/backstage-rhaap-backend/src/database/DatabaseHandler.ts`
- `plugins/backstage-rhaap-backend/src/database/DatabaseHandler.test.ts`

**DatabaseHandler methods**:
- `getSetupState(): Promise<{ setupComplete, localAdminEnabled }>`
- `setSetupComplete(complete: boolean): Promise<void>`
- `setLocalAdminEnabled(enabled: boolean): Promise<void>`
- `getConfigByCategory(category: string): Promise<ConfigRow[]>`
- `getAllConfig(): Promise<ConfigRow[]>`
- `upsertConfig(key: string, value: string, isSecret: boolean, category: string): Promise<void>`
- `deleteConfigByCategory(category: string): Promise<void>`
- `deleteConfig(key: string): Promise<void>`

**Acceptance criteria**:
- Migration creates tables correctly on SQLite and PostgreSQL
- All CRUD operations tested
- Upsert handles both insert and update
- >80% test coverage

**Complexity**: Medium
**Dependencies**: T1.2
**Blocked by**: T1.2

---

### T1.4 — Implement encryption module

**Files to create**:
- `plugins/backstage-rhaap-backend/src/config/encryption.ts`
- `plugins/backstage-rhaap-backend/src/config/encryption.test.ts`

**Functions**:
- `encrypt(plaintext: string, backendSecret: string): string` — returns `enc:v1:<base64>`
- `decrypt(ciphertext: string, backendSecret: string): string`
- `isEncrypted(value: string): boolean`
- Internal: `deriveKey(backendSecret: string): Buffer` — HKDF-SHA256

**Acceptance criteria**:
- Encrypt → decrypt round-trip produces original value
- Different plaintexts produce different ciphertexts (random IV)
- Same plaintext encrypted twice produces different ciphertexts
- Invalid ciphertext throws descriptive error
- Invalid key throws descriptive error
- `isEncrypted()` correctly identifies encrypted values
- >90% test coverage (crypto code needs high coverage)

**Complexity**: Small
**Dependencies**: None
**Blocked by**: None

---

### T1.5 — Implement PortalAdminService

**Files to create**:
- `plugins/backstage-rhaap-backend/src/service/PortalAdminService.ts`
- `plugins/backstage-rhaap-backend/src/service/PortalAdminService.test.ts`
- `plugins/backstage-rhaap-backend/src/providers/scmProviders.ts`

**Service methods**:
- `getSetupStatus(config: Config): SetupStatus`
- `saveAAPConfig(input: AAPConfig): Promise<void>` — validates + encrypts secrets + upserts
- `saveRegistriesConfig(input: RegistriesConfig): Promise<void>`
- `saveSCMConfig(provider: string, input: SCMConfig): Promise<void>`
- `deleteSCMConfig(provider: string): Promise<void>`
- `applySetup(): Promise<{ restartTriggered, deploymentMode }>`
- `batchSetup(input: BatchSetupConfig): Promise<void>` — atomic all-or-nothing
- `getConnections(): Promise<ConnectionsResponse>` — returns masked secrets
- `updateConnection(type: string, input: any): Promise<void>`
- `setLocalAdmin(enabled: boolean): Promise<void>`

**Validation rules**:
- `controllerUrl`: valid HTTPS URL
- `adminToken`: non-empty string
- `clientId`, `clientSecret`: non-empty strings
- `providerUrl`: valid URL (http or https)
- `token`: non-empty string
- `maxDepth`: positive integer if provided

**Acceptance criteria**:
- All methods tested with valid and invalid inputs
- Secrets encrypted before storage, masked on retrieval
- `applySetup()` validates AAP config exists before marking complete
- `batchSetup()` rolls back on any validation failure
- >80% test coverage

**Complexity**: Large
**Dependencies**: T1.1, T1.3, T1.4
**Blocked by**: T1.3, T1.4

---

### T1.6 — Write OpenAPI 3.1 spec

**Files to create**:
- `plugins/backstage-rhaap-backend/src/schema/openapi.yaml`

**Endpoints to document**:
- `GET /setup/status`
- `POST /setup/aap`
- `POST /setup/registries`
- `POST /setup/scm/{provider}`
- `DELETE /setup/scm/{provider}`
- `POST /setup/apply`
- `POST /setup/batch`
- `GET /connections`
- `PUT /connections/aap`
- `PUT /connections/registries`
- `PUT /connections/scm/{provider}`
- `DELETE /connections/scm/{provider}`
- `PUT /general/local-admin`
- `POST /connections/{type}/sync`
- `GET /openapi.json`

**Per endpoint**: operationId, summary, description, x-ai-hint, request body schema, response schemas (200, 400, 403, 404), security requirements.

**Response envelope**: `{ success: boolean, data?: T, error?: string, errorCode?: string }`

**Acceptance criteria**:
- Valid OpenAPI 3.1 spec (passes `redocly lint`)
- All endpoints documented with request/response schemas
- Every operation has a unique `operationId`
- Security schemes defined (bearer token)

**Complexity**: Medium
**Dependencies**: None (can be done in parallel with T1.3-T1.5)
**Blocked by**: None

---

### T1.7 — Generate typed router and implement API routes

**Files to create/modify**:
- `plugins/backstage-rhaap-backend/src/schema/openapi.generated.ts` (generated)
- `plugins/backstage-rhaap-backend/src/router.ts` (create)
- `plugins/backstage-rhaap-backend/src/router.test.ts` (create)

**Steps**:
1. Run `backstage-cli package schema openapi generate`
2. Implement router using `createOpenApiRouter()` from generated file
3. Wire routes to `PortalAdminService` methods
4. Add authorization checks using `permissions.authorize()`
5. Add `/openapi.json` endpoint serving the spec

**Acceptance criteria**:
- All endpoints return correct responses (tested with supertest)
- Request validation rejects malformed input (400)
- Authorization denies unauthorized access (403)
- Secrets never appear in responses
- `GET /setup/status` works without authentication
- >80% test coverage

**Complexity**: Medium
**Dependencies**: T1.5, T1.6
**Blocked by**: T1.5, T1.6

---

### T1.8 — Wire plugin registration, permissions, and local dev integration

**Files to modify**:
- `plugins/backstage-rhaap-backend/src/plugin.ts` (update — wire router, DB, service, register permissions via `permissionsRegistry.addPermissions(portalAdminPermissions)`)
- `packages/backend/src/index.ts` (modify — add `backend.add(import(...))`)

**Acceptance criteria**:
- `yarn start` boots with the new plugin registered
- `curl http://localhost:7007/api/rhaap-backend/setup/status` returns valid JSON
- Plugin appears in backend logs at startup
- Permissions `ansible.admin.view` and `ansible.admin.write` registered with Backstage permission framework
- `rhaap-backend` added to `pluginsWithPermission` in app-config

**Complexity**: Small
**Dependencies**: T1.7
**Blocked by**: T1.7

---

## Phase 2: Config Merging

**Goal**: DB-stored config available to all plugins via standard Config interface

### T2.1 — Implement bootstrap database connection

**Files to create**:
- `plugins/backstage-rhaap-backend/src/config/bootstrapConnection.ts`
- `plugins/backstage-rhaap-backend/src/config/bootstrapConnection.test.ts`

**Logic**:
1. Accept app-config file paths (from CLI args or defaults)
2. Parse YAML files directly (no Backstage config system)
3. Extract `backend.database.client` and `backend.database.connection`
4. Create standalone Knex instance
5. Run portal migrations if tables don't exist
6. Return Knex instance

**Acceptance criteria**:
- Works with `better-sqlite3` (file-based) config
- Works with PostgreSQL config
- Handles missing/invalid config gracefully
- Does not depend on Backstage `coreServices`

**Complexity**: Medium
**Dependencies**: T1.3
**Blocked by**: T1.3

---

### T2.2 — Implement config tree builder

**Files to create**:
- `plugins/backstage-rhaap-backend/src/config/configTreeBuilder.ts`
- `plugins/backstage-rhaap-backend/src/config/configTreeBuilder.test.ts`

**Logic**: Transforms flat `portal_config` rows into nested Backstage config object using the config key mapping table from SPEC Section 9.2.

**Test cases** (critical — these determine community plugin compatibility):
- AAP config → `ansible.rhaap.baseUrl`, `auth.providers.rhaap.<env>.host/clientId/clientSecret`
- GitHub SCM → `integrations.github[0].host/token`, `auth.providers.github.<env>.clientId/clientSecret`
- GitLab SCM → `integrations.gitlab[0].host/token`, `auth.providers.gitlab.<env>.clientId/clientSecret`
- Registry toggles → internal config structure
- Empty DB → empty config object
- Mixed categories → correct nested merge
- Auth environment detection (development vs production)

**Acceptance criteria**:
- All config key mappings from SPEC Section 9.2 tested
- Output format matches what `ScmIntegrations.fromConfig()` expects
- Output format matches what `createOAuthProviderFactory()` expects
- >90% test coverage (this is the critical integration point)

**Complexity**: Medium
**Dependencies**: T1.1 (constants)
**Blocked by**: T1.1

---

### T2.3 — Implement DatabaseConfigSource

**Files to create**:
- `plugins/backstage-rhaap-backend/src/config/DatabaseConfigSource.ts`
- `plugins/backstage-rhaap-backend/src/config/DatabaseConfigSource.test.ts`

**Logic**: Implements Backstage's `ConfigSource` async generator interface.

**Acceptance criteria**:
- Yields valid `ConfigSourceData` from DB
- Returns empty config when `portal_config` table is empty or doesn't exist
- Decrypts secrets before returning
- Works with both SQLite and PostgreSQL

**Complexity**: Medium
**Dependencies**: T2.1, T2.2, T1.4
**Blocked by**: T2.1, T2.2

---

### T2.4 — Integrate DatabaseConfigSource with backend startup

**Files to create/modify**:
- `plugins/backstage-rhaap-backend/src/config/rootConfigOverride.ts` (create)
- `plugins/backstage-rhaap-backend/src/plugin.ts` (modify)

**Logic**:
1. Create a custom `rootConfig` service factory
2. Call `ConfigSources.default()` for standard file/env config
3. Create `DatabaseConfigSource` via bootstrap connection
4. Merge via `MergedConfigSource.from([defaultSource, dbSource])`
5. Return via `ConfigSources.toConfig(mergedSource)`

**For RHDH dynamic plugin**: Requires `ENABLE_CORE_ROOTCONFIG_OVERRIDE=true` env var.
**For local dev**: Override registered directly in the backend plugin.

**Acceptance criteria**:
- Community plugins see DB-stored config via `config.getString()`
- DB config overrides static app-config.yaml values
- Empty DB → static config used as-is (no errors)
- Works in local dev with SQLite

**Complexity**: Large
**Dependencies**: T2.3
**Blocked by**: T2.3

---

### T2.5 — Modify RHAAP auth module for DB-backed config hot-reload

**Files to modify**:
- `plugins/auth-backend-module-rhaap-provider/src/authenticator.ts`
- `plugins/auth-backend-module-rhaap-provider/src/authenticator.test.ts`

**Changes**:
- `initialize()`: Read static config as defaults, store reference for dynamic resolution
- `authenticate()` / `refresh()`: Resolve config from DB (60s TTL cache) → fall back to static
- Recreate OAuth2Strategy only when config hash changes

**Acceptance criteria**:
- Auth works with static config only (no DB) — backward compatible
- Auth works with DB config overriding static config
- Config changes in DB take effect within 60 seconds without restart
- OAuth2Strategy recreated only when config actually changes (not on every request)
- Existing tests still pass
- New tests for DB config resolution

**Complexity**: Large
**Dependencies**: T1.3
**Blocked by**: T1.3

---

## Phase 3: Setup Wizard (Frontend)

**Goal**: 5-step wizard in self-service plugin matching Figma screens 2-10

### T3.1 — Add API client and routes to self-service plugin

**Files to modify/create**:
- `plugins/self-service/src/apis.ts` (modify — add `PortalAdminApi`, `PortalAdminClient`, `portalAdminApiRef`)
- `plugins/self-service/src/routes.ts` (modify — add `setupRouteRef`, admin route refs)
- `plugins/self-service/src/plugin.ts` (modify — add API factory, route extensions)
- `plugins/self-service/src/hooks/useSetupStatus.ts` (create)
- `plugins/self-service/src/hooks/usePortalAdminApi.ts` (create)

**Acceptance criteria**:
- `portalAdminApiRef` registered in plugin
- `useSetupStatus()` hook fetches and returns setup status
- `usePortalAdminApi()` hook returns typed API client
- API client methods match all backend endpoints

**Complexity**: Medium
**Dependencies**: T1.8
**Blocked by**: T1.8

---

### T3.2 — Implement SetupGate component

**Files to create**:
- `plugins/self-service/src/components/SetupGate/SetupGate.tsx`
- `plugins/self-service/src/components/SetupGate/SetupGate.test.tsx`
- `plugins/self-service/src/components/SetupGate/index.ts`

**Logic**: Mounted as `application/listener`. On route change, checks setup status. Redirects to `/self-service/setup` if `onboardingEnabled && !setupComplete`.

**Acceptance criteria**:
- Redirects to setup wizard when setup not complete
- Does nothing when setup is complete
- Does nothing when onboarding is disabled
- Does not redirect if already on `/setup` route (no loop)
- Loading state handled (no flash of redirect)

**Complexity**: Small
**Dependencies**: T3.1
**Blocked by**: T3.1

---

### T3.3 — Implement SetupWizard container and stepper

**Files to create**:
- `plugins/self-service/src/components/SetupWizard/SetupWizard.tsx`
- `plugins/self-service/src/components/SetupWizard/useWizardState.ts`
- `plugins/self-service/src/components/SetupWizard/index.ts`

**Logic**:
- 5-step stepper (MUI Stepper) with left sidebar navigation
- Wizard state managed via `useWizardState` hook
- Each step saves draft to backend on "Next"
- Header: "Setup Ansible Automation Portal"

**Acceptance criteria**:
- Stepper shows all 5 steps with correct labels
- Navigation between steps works (Back/Next)
- Current step highlighted in stepper
- State persists across step navigation
- Matches Figma layout (left stepper + right content area)

**Complexity**: Medium
**Dependencies**: T3.1
**Blocked by**: T3.1

---

### T3.4 — Implement OverviewStep (Screen 2)

**Files to create**:
- `plugins/self-service/src/components/SetupWizard/OverviewStep.tsx`
- `plugins/self-service/src/components/SetupWizard/OverviewStep.test.tsx`

**Content**: "Overview & Prerequisites" with bullet list of what you'll need.

**Acceptance criteria**:
- Matches Figma screen 2
- "Next" button advances to step 2
- No form fields (informational only)

**Complexity**: Small
**Dependencies**: T3.3
**Blocked by**: T3.3

---

### T3.5 — Implement ConnectAAPStep (Screen 3)

**Files to create**:
- `plugins/self-service/src/components/SetupWizard/ConnectAAPStep.tsx`
- `plugins/self-service/src/components/SetupWizard/ConnectAAPStep.test.tsx`

**Form fields**: AAP Controller URL, Admin PAT, Client ID, Client Secret.
**Sections**: "Connect AAP", "Service Access (Discovery & Execution)", "User Sign-in (OAuth)".

**Acceptance criteria**:
- All fields render with correct labels, placeholders, helpers
- Required field validation on "Next"
- URL validation for Controller URL (HTTPS)
- Password fields masked
- "Find these under AAP application settings" link
- Calls `POST /setup/aap` on "Next"
- Pre-fills if returning to step (data loaded from state/API)

**Complexity**: Medium
**Dependencies**: T3.3
**Blocked by**: T3.3

---

### T3.6 — Implement ConnectRegistriesStep (Screen 4)

**Files to create**:
- `plugins/self-service/src/components/SetupWizard/ConnectRegistriesStep.tsx`
- `plugins/self-service/src/components/SetupWizard/ConnectRegistriesStep.test.tsx`

**UI elements**: PAH toggle + inherit checkbox, Certified/Validated/Galaxy toggles.

**Acceptance criteria**:
- All toggles default to "On"
- PAH inherit checkbox shows/hides URL+Token fields
- Calls `POST /setup/registries` on "Next"
- Matches Figma screen 4

**Complexity**: Small
**Dependencies**: T3.3
**Blocked by**: T3.3

---

### T3.7 — Implement SCM provider registry and ConnectSCMModal

**Files to create**:
- `plugins/self-service/src/providers/scmRegistry.ts`
- `plugins/self-service/src/providers/githubProvider.tsx`
- `plugins/self-service/src/providers/gitlabProvider.tsx`
- `plugins/self-service/src/components/SetupWizard/ConnectSCMModal.tsx`
- `plugins/self-service/src/components/SetupWizard/ConnectSCMModal.test.tsx`

**Modal fields (driven by provider descriptor)**:
- Service Access: Provider URL, PAT
- Discovery Scope: Target Organization, EE Filename, Source Branches, Max Folder Depth
- User Sign-in (SSO): Client ID, Client Secret

**Acceptance criteria**:
- Modal renders fields from provider descriptor
- GitHub and GitLab use same modal component with different config
- Adding a new provider = adding one file + one import (verified by review)
- Calls `POST /setup/scm/:provider` on save
- Matches Figma screen 6

**Complexity**: Medium
**Dependencies**: T3.3, T1.1
**Blocked by**: T3.3

---

### T3.8 — Implement ConnectSourceControlStep (Screens 5, 7)

**Files to create**:
- `plugins/self-service/src/components/SetupWizard/ConnectSourceControlStep.tsx`
- `plugins/self-service/src/components/SetupWizard/ConnectSourceControlStep.test.tsx`

**Logic**: Renders provider cards from SCM registry. "Connect" opens modal (T3.7). After connecting, card shows "Connected" + "Edit" button.

**Acceptance criteria**:
- Cards rendered dynamically from provider registry
- "Connect" opens modal, "Edit" opens pre-filled modal
- Connected state shown with checkmark
- Step is optional (can advance without connecting any SCM)
- Matches Figma screens 5 and 7

**Complexity**: Small
**Dependencies**: T3.7
**Blocked by**: T3.7

---

### T3.9 — Implement ReviewStep (Screen 8)

**Files to create**:
- `plugins/self-service/src/components/SetupWizard/ReviewStep.tsx`
- `plugins/self-service/src/components/SetupWizard/ReviewStep.test.tsx`

**Logic**: Reads saved config from API, displays summary with masked secrets.

**Acceptance criteria**:
- Shows all configured sections (AAP, Registries, SCM)
- Secrets displayed as `********`
- "Note: Sensitive values..." disclaimer at bottom
- "Apply & Restart Portal" button calls `POST /setup/apply`
- Matches Figma screen 8

**Complexity**: Medium
**Dependencies**: T3.3
**Blocked by**: T3.5, T3.6, T3.8 (all steps should be implemented first)

---

### T3.10 — Implement ApplyingScreen and SetupCompleteScreen (Screens 9, 10)

**Files to create**:
- `plugins/self-service/src/components/SetupWizard/ApplyingScreen.tsx`
- `plugins/self-service/src/components/SetupWizard/SetupCompleteScreen.tsx`
- `plugins/self-service/src/components/SetupWizard/ApplyingScreen.test.tsx`
- `plugins/self-service/src/components/SetupWizard/SetupCompleteScreen.test.tsx`

**ApplyingScreen**: Spinner + "Applying configuration..." + polls `GET /setup/status` every 2s.
**SetupCompleteScreen**: Green checkmark + "System Configured & Ready" + "Go to login" button.

**Acceptance criteria**:
- ApplyingScreen polls and transitions to complete when backend is healthy
- Shows manual instruction after 90s timeout
- SetupCompleteScreen "Go to login" logs out and redirects to sign-in page
- Matches Figma screens 9 and 10

**Complexity**: Small
**Dependencies**: T3.3
**Blocked by**: T3.9

---

### T3.11 — Add routes to RouteView and exports to index.ts

**Files to modify**:
- `plugins/self-service/src/components/RouteView/RouteView.tsx`
- `plugins/self-service/src/index.ts`
- `plugins/self-service/src/plugin.ts`

**Acceptance criteria**:
- `/setup` route renders SetupWizard
- `SetupWizardPage`, `SetupGate` exported from index.ts and plugin.ts
- Plugin extensions registered for dynamic plugin loading
- Existing routes unchanged

**Complexity**: Small
**Dependencies**: T3.2, T3.3
**Blocked by**: T3.10

---

## Phase 4: Admin Pages (Frontend)

**Goal**: Post-setup admin pages matching Figma screens 1, 11, 12

### T4.1 — Implement GeneralPage (Screen 11)

**Files to create**:
- `plugins/self-service/src/components/AdminPages/GeneralPage.tsx`
- `plugins/self-service/src/components/AdminPages/GeneralPage.test.tsx`

**UI**: "Security & Access Control" card with "Local Admin Access (Bootstrap)" toggle.

**Acceptance criteria**:
- Toggle reflects current state from API
- Toggle calls `PUT /general/local-admin`
- Description text matches Figma
- Permission-gated (admin only)

**Complexity**: Small
**Dependencies**: T3.1
**Blocked by**: T3.1

---

### T4.2 — Implement ConnectionCard component

**Files to create**:
- `plugins/self-service/src/components/AdminPages/ConnectionCard.tsx`
- `plugins/self-service/src/components/AdminPages/ConnectionCard.test.tsx`

**Props**: title, icon, status indicators (content discovery, SSO), host, auth method, onEdit, onSync, configured flag.

**Acceptance criteria**:
- Renders card matching Figma screen 12 layout
- "Edit" and "Sync now" buttons when configured
- "Connect" button when not configured
- Status badges (Active/Inactive)

**Complexity**: Small
**Dependencies**: None
**Blocked by**: None

---

### T4.3 — Implement ConnectionsPage (Screen 12)

**Files to create**:
- `plugins/self-service/src/components/AdminPages/ConnectionsPage.tsx`
- `plugins/self-service/src/components/AdminPages/ConnectionsPage.test.tsx`
- `plugins/self-service/src/components/AdminPages/index.ts`

**Sections**: "Automation & Content Platforms" (AAP, PAH, Public Registers), "Source control providers" (GitHub, GitLab).

**Acceptance criteria**:
- Loads connections from `GET /connections`
- "Edit" opens pre-filled form (reuses wizard step forms)
- "Sync now" calls `POST /connections/:type/sync`
- Public Registers shows toggles with external links
- Matches Figma screen 12

**Complexity**: Large
**Dependencies**: T4.2, T3.5, T3.6, T3.7 (reuses wizard forms)
**Blocked by**: T4.2

---

### T4.4 — Implement RBACPage (Screen 1)

**Files to create**:
- `plugins/self-service/src/components/AdminPages/RBACPage.tsx`
- `plugins/self-service/src/components/AdminPages/RBACPage.test.tsx`

**Logic**: Wraps existing RHDH RBAC plugin APIs (`@backstage-community/plugin-rbac`).

**UI**: Filters (Source, Portal Role), User groups table (Group name, Source, Members, Portal Role dropdown, Last Sync), search, pagination.

**Acceptance criteria**:
- Groups loaded from RHDH RBAC/catalog APIs
- Portal Role changes saved via RHDH RBAC APIs
- Search and filter work
- Pagination works
- Matches Figma screen 1

**Complexity**: Large
**Dependencies**: T3.1
**Blocked by**: T3.1

---

### T4.5 — Add admin routes with permission gating and sidebar menu items

**Files to modify**:
- `plugins/self-service/src/components/RouteView/RouteView.tsx` (add admin routes wrapped in `<RequirePermission permission={portalAdminViewPermission}>`)
- `plugins/self-service/src/index.ts` (add admin page exports)
- `plugins/self-service/src/plugin.ts` (add admin page extensions)

**Permission gating pattern** (matches existing `RouteView.tsx` pattern for `catalogEntityCreatePermission`):
```tsx
<Route path="admin/general" element={
  <RequirePermission permission={portalAdminViewPermission}>
    <GeneralPage />
  </RequirePermission>
} />
```

**Component-level write permission** (in `GeneralPage`, `ConnectionsPage`):
- "Edit", "Sync now", toggle buttons use `usePermission({ permission: portalAdminWritePermission })`
- Following same pattern as `Home.tsx` using `usePermission({ permission: catalogEntityCreatePermission })`

**Sidebar visibility**: ADMINISTRATION menu items conditionally rendered using `usePermission({ permission: portalAdminViewPermission })`

**Acceptance criteria**:
- `/admin/general`, `/admin/connections`, `/admin/rbac` routes work
- Routes gated by `portalAdminViewPermission` via `RequirePermission`
- Write actions (edit, sync, toggle) gated by `portalAdminWritePermission` via `usePermission`
- ADMINISTRATION sidebar items only visible to users with `ansible.admin.view` permission
- Users without admin permission see "Unauthorized" page (Backstage default)
- RBAC CSV policy can grant/revoke admin access per user/group
- Admin page exports available for dynamic plugin config
- Existing routes unchanged

**Complexity**: Small
**Dependencies**: T4.1, T4.3, T4.4
**Blocked by**: T4.1, T4.3, T4.4

---

## Phase 5: Deployment Integration

**Goal**: End-to-end on OpenShift + RHEL appliance

### T5.1 — Implement RestartService

**Files to create**:
- `plugins/backstage-rhaap-backend/src/service/RestartService.ts`
- `plugins/backstage-rhaap-backend/src/service/RestartService.test.ts`

**Logic**: `detectDeploymentMode()` + `triggerRestart()` — graceful `process.exit(0)` for RHEL, K8s API patch for OpenShift, manual for local.

**Acceptance criteria**:
- No `execFile`, `exec`, or shell spawning
- Deployment mode correctly detected
- K8s API patch constructs correct request
- Graceful exit uses 2s delay
- All paths tested

**Complexity**: Medium
**Dependencies**: T1.5
**Blocked by**: T1.5

---

### T5.2 — Update Helm chart

**Files to create/modify (in `ansible-portal-chart`)**:
- `templates/restart-rbac.yaml` (create — Role + RoleBinding)
- `templates/_helpers.tpl` (modify — add `plugins.load.rhaap-backend`)
- `values.yaml` (modify — add backend plugin entry, update self-service config, add onboarding flag, add `ENABLE_CORE_ROOTCONFIG_OVERRIDE` env var, add `DEPLOYMENT_NAME` env var)

**Acceptance criteria**:
- `helm template` renders RBAC resources
- Backend plugin entry in dynamic plugins list
- Self-service plugin config includes new routes/mountPoints/menuItems
- `ansible.portal.onboarding.enabled` defaults to `true` for new installs
- `ENABLE_CORE_ROOTCONFIG_OVERRIDE=true` in extraEnvVars
- `rhaap-backend` added to `pluginsWithPermission` list (alongside catalog, scaffolder, permission)

**Complexity**: Medium
**Dependencies**: T1.8, T3.11, T4.5
**Blocked by**: T4.5

---

### T5.3 — Update RHEL appliance app-config

**Files to modify (in `automation-portal-bootc-container`)**:
- `bootc/configs/app-config/app-config.yaml` (add `ansible.portal.onboarding.enabled: true`)
- `bootc/configs/dynamic-plugins/dynamic-plugins.override.yaml` (add backstage-rhaap-backend plugin entry)

**Acceptance criteria**:
- Onboarding enabled by default on RHEL
- Backend plugin loaded in dynamic plugins config
- Existing config unchanged

**Complexity**: Small
**Dependencies**: T5.2
**Blocked by**: T5.2

---

### T5.4 — Dynamic plugin export and packaging

**Files to modify**:
- `plugins/backstage-rhaap-backend/package.json` (add `export-dynamic` script)
- `plugins/self-service/package.json` (verify export-dynamic includes new exports)

**Acceptance criteria**:
- `yarn workspace @ansible/backstage-rhaap-backend export-dynamic` succeeds
- `yarn workspace @ansible/plugin-backstage-self-service export-dynamic` succeeds
- Exported plugin includes all new components/routes
- Works when loaded dynamically in RHDH

**Complexity**: Medium
**Dependencies**: T3.11, T4.5, T1.8
**Blocked by**: T3.11, T4.5

---

### T5.5 — E2E tests

**Files to create**:
- `e2e-tests/tests/setup-wizard.spec.ts`
- `e2e-tests/tests/admin-pages.spec.ts`

**Test scenarios**:
- Full setup wizard flow (all 5 steps → apply → success)
- Setup wizard with only AAP (skip SCM)
- Admin pages accessible after setup
- Connections page Edit/Sync
- General page local admin toggle
- Setup gate redirects when setup not complete

**Acceptance criteria**:
- All scenarios pass on local dev (SQLite)
- Tests use Playwright

**Complexity**: Large
**Dependencies**: All previous phases
**Blocked by**: T5.4

---

## Phase 6: Polish

**Goal**: Production-ready with full CI integration

### T6.1 — CI tooling for OpenAPI spec

**Files to create/modify**:
- `.github/workflows/` (add OpenAPI validation steps)
- `plugins/backstage-rhaap-backend/package.json` (add lint/diff scripts)

**Checks**: Spec lint (`redocly`), spec-to-code sync, breaking change detection.

**Complexity**: Small
**Dependencies**: T1.6
**Blocked by**: T1.6

---

### T6.2 — Catalog API entity

**Files to create**:
- `plugins/backstage-rhaap-backend/catalog-info.yaml`

**Complexity**: Small
**Dependencies**: T1.6
**Blocked by**: T1.6

---

### T6.3 — Documentation

**Files to create**:
- `docs/features/setup-wizard.md`
- `docs/features/admin-pages.md`
- `docs/features/config-as-code.md` (with curl examples)

**Complexity**: Medium
**Dependencies**: All phases
**Blocked by**: T5.5

---

## Phase 7: Local Admin Auth + Recovery (Integrated into RHAAP Provider)

**Goal**: Extend RHAAP auth with local admin login, add recovery mechanisms, remove guest auth dependency

### T7.1 — Add local-login endpoint to RHAAP auth module

**Files to create/modify**:
- `plugins/auth-backend-module-rhaap-provider/src/localAdmin.ts` (create) — bcrypt validation, rate limiting, audit logging
- `plugins/auth-backend-module-rhaap-provider/src/localAdmin.test.ts` (create) — Tests
- `plugins/auth-backend-module-rhaap-provider/src/module.ts` (modify) — Register `/local-login` route
- `plugins/auth-backend-module-rhaap-provider/package.json` (modify) — Add `bcrypt` dependency

**Logic**:
1. `POST /api/auth/rhaap/local-login` accepts `{ username, password }`
2. Check `portal_setup.local_admin_enabled` via `rhaap-backend` API
3. Validate: `username === 'admin'` AND `bcrypt.compare(password, PORTAL_ADMIN_PASSWORD_HASH)`
4. For local dev: direct compare against `ansible.portal.admin.password` config
5. Rate limit: 5 failures/min per IP
6. On success: issue Backstage identity for `user:default/admin`
7. Audit log all attempts

**Acceptance criteria**:
- Valid admin/password → authenticated with admin identity
- Wrong password → 401 + audit log
- Local admin disabled → 403
- Rate limit exceeded → 429
- `yarn tsc` and `yarn test` pass
- >80% test coverage

**Complexity**: Medium
**Dependencies**: None (extends existing module)

---

### T7.2 — Update sign-in page for dual-mode RHAAP

**Files to modify**:
- `plugins/self-service/src/components/SignInPage/SignInPage.tsx` — Add local admin form
- `packages/app/src/App.tsx` — Update sign-in component to fetch setup status

**Logic**:
- Fetch `GET /api/rhaap-backend/setup/status` before rendering
- If `localAdminEnabled=true`: Show "Local Admin" card with username/password form + "AAP" OAuth button
- If `localAdminEnabled=false`: Show only "Sign in with AAP" button
- Local admin form POSTs to `/api/auth/rhaap/local-login`
- Remove guest and GitHub from sign-in providers

**Acceptance criteria**:
- Local admin form visible when enabled, hidden when disabled
- Username/password submission works end-to-end
- AAP OAuth still works when local admin is disabled
- No guest auth on sign-in page

**Complexity**: Medium
**Dependencies**: T7.1

---

### T7.3 — Helm chart: admin credentials secret + NOTES.txt

**Files to create/modify** (in `ansible-portal-chart/`):
- `templates/admin-credentials-job.yaml` (create) — Pre-install hook Job that generates password + bcrypt hash, creates K8s Secret
- `templates/NOTES.txt` (modify) — Display admin password retrieval command
- `values.yaml` (modify) — Add `PORTAL_ADMIN_PASSWORD_HASH` to extraEnvVars via secretKeyRef

**Pre-install hook Job**:
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "janus-idp.name" . }}-admin-credentials
  annotations:
    helm.sh/hook: pre-install
    helm.sh/hook-weight: "-5"
spec:
  template:
    spec:
      containers:
        - name: generate
          image: registry.redhat.io/rhel9/rhel-minimal
          command: ["/bin/bash", "-c"]
          args:
            - |
              PASSWORD=$(openssl rand -base64 18)
              HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('$PASSWORD'.encode(), bcrypt.gensalt(12)).decode())")
              kubectl create secret generic rhaap-portal-admin-credentials \
                --from-literal=password="$PASSWORD" \
                --from-literal=password-hash="$HASH"
```

**NOTES.txt addition**:
```
Admin credentials for initial setup:
  kubectl get secret rhaap-portal-admin-credentials -o jsonpath='{.data.password}' | base64 -d
```

**Acceptance criteria**:
- `helm install` creates admin credentials secret automatically
- Password retrievable via kubectl command shown in NOTES.txt
- `PORTAL_ADMIN_PASSWORD_HASH` env var injected into portal pod

**Complexity**: Medium
**Dependencies**: None

---

### T7.4 — RHEL bootc: admin password in portal-setup.py

**Files to modify** (in `automation-portal-bootc-container/bootc/`):
- `scripts/portal-setup.py` — Add admin password generation to `_store_secrets()` method
- `scripts/lib/common.sh` — Add `ADMIN_PASSWORD_HASH` to secret list
- `containers/portal.container` — Add `Secret=portal_admin_password_hash,type=env,target=PORTAL_ADMIN_PASSWORD_HASH`
- `scripts/portal-config.sh` — Add `LOCAL_ADMIN_ENABLED` and `ADMIN_PASSWORD` set commands
- `scripts/portal-status.sh` — Display admin password in status output

**portal-setup.py changes**:
```python
# In _store_secrets() method, add:
admin_password = self._generate_random_password(24)
admin_hash = bcrypt.hashpw(admin_password.encode(), bcrypt.gensalt(12)).decode()
secret_pairs["ADMIN_PASSWORD_HASH"] = admin_hash
self.logger.info(f"Admin password for initial setup: {admin_password}")
```

**portal-config.sh changes**:
```bash
# Add to set_config_value():
"LOCAL_ADMIN_ENABLED")
  # Update portal_setup table directly via SQLite
  sqlite3 /var/lib/portal/postgres-data/rhaap-backend.sqlite \
    "UPDATE portal_setup SET local_admin_enabled = $([ "$value" = "true" ] && echo 1 || echo 0)"
  ;;
"ADMIN_PASSWORD")
  # Generate new bcrypt hash and update Podman secret
  new_hash=$(python3 -c "import bcrypt; print(bcrypt.hashpw(b'$value', bcrypt.gensalt(12)).decode())")
  create_portal_secret "ADMIN_PASSWORD_HASH" "$new_hash"
  ;;
```

**Acceptance criteria**:
- `portal-setup.py` generates admin password and stores bcrypt hash as Podman secret
- Admin password displayed in setup output and `portal-status` CLI
- `portal-config set LOCAL_ADMIN_ENABLED=true` works without portal access
- `portal-config set ADMIN_PASSWORD=newpass` rotates admin password

**Complexity**: Medium
**Dependencies**: None (can parallelize with T7.1-T7.2)

---

### T7.5 — Update app-config.local.yaml and remove guest auth

**Files to modify**:
- `app-config.local.yaml` — Remove guest provider, remove GitHub auth, add local admin password, keep only RHAAP
- `app-config.yaml` — Remove guest provider reference
- `packages/app/src/App.tsx` — Remove `'guest'` from providers list
- `packages/backend/src/index.ts` — Remove guest provider module import

**Acceptance criteria**:
- Sign-in page shows only RHAAP (local admin + AAP modes)
- No guest auth available in any deployment
- Local dev uses plain password config for local admin
- `yarn tsc`, `yarn lint`, `yarn test` all pass

**Complexity**: Small
**Dependencies**: T7.2
**Blocked by**: T7.2

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| **1. Foundation** | T1.1–T1.8 | Backend plugin, DB, encryption, APIs, OpenAPI |
| **2. Config Merging** | T2.1–T2.5 | DatabaseConfigSource, auth hot-reload |
| **3. Setup Wizard** | T3.1–T3.11 | 5-step wizard UI |
| **4. Admin Pages** | T4.1–T4.5 | General, Connections, RBAC pages |
| **5. Deployment** | T5.1–T5.5 | Helm chart, RHEL config, E2E tests |
| **6. Polish** | T6.1–T6.3 | CI tooling, docs |
| **7. Local Admin Auth** | T7.1–T7.5 | Integrated local admin in RHAAP provider, recovery CLI, Helm/bootc secrets |

**Total tasks**: 34 (29 original + 5 new)
**Critical path**: T1.1 → T1.2 → T1.3 → T1.5 → T1.7 → T1.8 → T2.1 → T2.3 → T2.4 → T3.1 → T3.3 → T3.11

**Parallelizable work**:
- T1.4 (encryption) can be done in parallel with T1.2–T1.3
- T1.6 (OpenAPI spec) can be done in parallel with T1.3–T1.5
- T2.2 (config tree builder) can be done in parallel with T2.1
- T2.5 (auth hot-reload) can be done in parallel with T2.1–T2.3
- T3.4–T3.8 (wizard steps) can be parallelized after T3.3
- T4.1–T4.4 (admin pages) can be parallelized after T3.1
- T6.1–T6.2 can be done anytime after T1.6
