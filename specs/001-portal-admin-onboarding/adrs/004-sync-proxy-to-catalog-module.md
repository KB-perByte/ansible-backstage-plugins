# ADR-004: Sync Proxy to Catalog Module via Service-to-Service Auth

**Status**: Accepted
**Date**: 2026-04-01
**Deciders**: Portal team

## Context

The Connections admin page has "Sync now" buttons for AAP, PAH, and SCM providers. The actual sync logic (fetching entities from AAP, collections from PAH, content from GitHub/GitLab) is implemented in the `catalog-backend-module-rhaap` plugin, which exposes sync endpoints:

- `GET /aap/sync_orgs_users_teams` — AAP entity sync
- `POST /ansible/sync/from-aap/content` — PAH collection sync
- `POST /ansible/sync/from-scm/content` — SCM content sync

We considered:

1. **Direct catalog API calls from frontend**: Frontend calls catalog sync endpoints directly
2. **Duplicate sync logic in rhaap-backend**: Re-implement sync in the admin backend
3. **Proxy through rhaap-backend**: Admin backend proxies sync requests to catalog using service-to-service auth

## Alternatives Considered

### Option 1: Direct Catalog API Calls from Frontend (Rejected)

Frontend JavaScript calls the catalog sync endpoints directly (`POST /api/catalog/ansible/sync/from-aap/content`).

**Why rejected:**

- **Permission mismatch**: Catalog sync endpoints are designed for service-to-service calls (plugin credentials), not user-initiated requests. They don't check `portalAdminWritePermission` — they either accept all authenticated requests or only service tokens, depending on the catalog module's auth policy
- **URL exposure**: Frontend would need to know the catalog plugin's internal URL structure. If the catalog module's sync endpoints change paths or request format, every frontend component that calls sync must be updated
- **CORS/auth complexity**: The catalog plugin may not accept frontend-issued user JWTs for sync operations. Backstage's auth model distinguishes between user credentials (for UI-facing APIs) and service credentials (for plugin-to-plugin calls)

### Option 2: Duplicate Sync Logic in rhaap-backend (Rejected)

Re-implement the sync logic (fetching from AAP, PAH, GitHub/GitLab) directly in the admin backend plugin.

**Why rejected:**

- **Massive code duplication**: The catalog module has thousands of lines of provider-specific sync code (`AapEntityProvider`, `PAHCollectionProvider`, `AnsibleGitContentsProvider`) with retry logic, pagination, error handling, and entity transformation. Duplicating this is impractical and creates a maintenance burden
- **Entity provider coupling**: Catalog sync works by calling `run()` or `startSync()` on entity providers that are registered with the catalog's `EntityProviderConnection`. These providers are internal to the catalog module — the admin backend can't access them directly
- **Divergence risk**: Two sync implementations would inevitably diverge, leading to different behavior when syncing from the admin page vs the catalog's scheduled sync

### Option 3: Shared Sync Service (Considered, too complex)

Extract sync logic into a shared service ref that both catalog-module-rhaap and rhaap-backend depend on.

**Why rejected:**

- Sync logic is tightly coupled to catalog entity providers (`EntityProviderConnection.applyMutation()`). Extracting it requires refactoring the entire catalog module
- Creates a circular dependency: shared service needs catalog infrastructure, admin backend needs shared service, catalog module needs shared service
- Overkill for what is essentially a "trigger" operation — the admin page just needs to say "start syncing", not implement the sync itself

## Decision

**Proxy through rhaap-backend** using Backstage's service-to-service authentication (`auth.getPluginRequestToken()`).

**Why this approach wins:**

- The sync logic already works in the catalog module. We're just triggering it remotely — no duplication needed
- Service-to-service auth is Backstage's standard pattern for plugin-to-plugin communication. The token is scoped to the target plugin and carries trusted service credentials
- The mapping from user-facing sync types (`aap`, `pah`, `github`) to catalog endpoint paths is centralized in one `switch` statement — easy to maintain and test
- Frontend stays simple: one `triggerSync(type)` call with the user's JWT. The rhaap-backend handles permission checking, credential exchange, and endpoint routing

### Request Flow

```
  Browser                  rhaap-backend              catalog-backend-module-rhaap
  ───────                  ──────────────             ─────────────────────────────

  Click "Sync now"
  on AAP card
       │
       │  POST /connections/aap/sync
       │  Authorization: Bearer <user-jwt>
       │
       ▼
       ├──► authorizeWrite()
       │    check portalAdminWritePermission
       │
       ├──► auth.getPluginRequestToken()
       │    targetPluginId: 'catalog'
       │    → service-to-service token
       │
       ├──► Map sync type to endpoint:
       │
       │    "aap"    → GET  /aap/sync_orgs_users_teams
       │    "pah"    → POST /ansible/sync/from-aap/content
       │                    body: { filters: [{repository_name: "rh-certified"}, ...] }
       │    "github" → POST /ansible/sync/from-scm/content
       │                    body: { filters: [{scmProvider: "github"}] }
       │    "gitlab" → POST /ansible/sync/from-scm/content
       │                    body: { filters: [{scmProvider: "gitlab"}] }
       │
       │  GET /aap/sync_orgs_users_teams
       │  Authorization: Bearer <service-token>
       │─────────────────────────────────────────────►
       │                                              │
       │                                              ├── AapEntityProvider.run()
       │                                              │   fetch orgs, users, teams
       │                                              │
       │                                              ├── AAPJobTemplateProvider.run()
       │                                              │   fetch job templates
       │                                              │
       │◄─────────────────────────────────────────────┤
       │  200 { synced: true }                        │
       │
       ▼
  200 { success: true, data: { synced: true } }
       │
       ▼
  Snackbar: "Sync triggered for aap"
```

### Permission Model

```
  Frontend user                    rhaap-backend           catalog
  ─────────────                    ──────────────          ───────
  portalAdminWritePermission ────► checked here
                                        │
                                        │  service-to-service
                                        │  (trusted, no user
                                        │   permission check)
                                        ├────────────────────► accepted
```

Only one permission check at the rhaap-backend boundary. The catalog accepts the request because it comes with a valid service-to-service token.

## Consequences

**Positive:**

- Single permission check: frontend only needs `portalAdminWritePermission` — the catalog call uses trusted service-to-service auth
- No need to expose catalog sync endpoints to frontend users or configure separate permissions for them
- Sync type mapping (`aap` -> `/aap/sync_orgs_users_teams`) is centralized in one place
- Frontend remains simple — one `triggerSync(type)` API call

**Negative:**

- Extra network hop (frontend -> rhaap-backend -> catalog) adds latency, but sync is async so this is negligible
- rhaap-backend must know the catalog module's URL structure — coupling between plugins. If catalog sync endpoints change, rhaap-backend must be updated

## Related

- `plugins/backstage-rhaap-backend/src/router.ts` (sync proxy handler)
- `plugins/backstage-rhaap-backend/src/plugin.ts` (discovery + auth service deps)
- `plugins/catalog-backend-module-rhaap/src/router.ts` (upstream sync endpoints)
