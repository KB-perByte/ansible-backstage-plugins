# ADR-003: Extend Existing Plugins Over Creating New Packages

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Portal team

## Context

The onboarding feature needs frontend components (setup wizard, admin pages, sidebar items), shared types/permissions, and a backend API. We considered:

1. **New packages**: Create `plugin-portal-admin` (frontend), `plugin-portal-admin-backend`, `plugin-portal-admin-common`
2. **Extend existing**: Add to `self-service` (frontend), `backstage-rhaap-common` (types), create only one new `backstage-rhaap-backend` (backend)

## Alternatives Considered

### Option A: Three New Packages (Rejected)

Create `plugin-portal-admin` (frontend), `plugin-portal-admin-backend` (backend), and `plugin-portal-admin-common` (shared types).

**Why rejected:**

- **Duplicated infrastructure**: The new frontend plugin would need its own `createPlugin()`, API factories (`discoveryApiRef`, `fetchApiRef`), permission hooks, and route registration — all of which already exist in `self-service`
- **Dynamic plugin overhead**: Each package becomes a separate dynamic plugin artifact that must be built, published to the OCI registry, and configured in the Helm chart. Three new entries in `dynamic-plugins.yaml` vs zero (since `self-service` is already configured)
- **Shared state complexity**: Admin pages need access to the same `PortalAdminApi` client that the setup wizard uses. With separate plugins, this requires either cross-plugin API sharing (complex in Backstage) or duplicating the API client
- **Test environment**: Each new package needs its own Jest config, test setup, and mock infrastructure. Extending existing packages reuses all of this

### Option B: Single New Monolith Package (Rejected)

Create one large `plugin-portal-admin` that contains frontend, backend, and common code.

**Why rejected:**

- Backstage plugins have a single `role` — either `frontend-plugin` or `backend-plugin`. A monolith can't be both
- Violates Backstage's architectural pattern where frontend and backend are separately deployed and versioned

## Decision

**Extend existing plugins** with only one new backend package:

**Why this approach wins:**

- The `self-service` plugin already owns the portal's UI surface, routes, and sidebar items. Admin pages are a natural extension of this — they share the same navigation context and permission infrastructure
- `backstage-rhaap-common` already exports shared types and service refs used by multiple plugins. Adding admin types and permissions here follows the established pattern
- The only genuinely new concern is the backend admin API — there was no existing backend plugin for portal-level operations, so `backstage-rhaap-backend` is the one necessary new package
- For the auth module, local admin is a *mode* of RHAAP auth (same provider, different authentication method), not a separate identity system. Extending the existing module keeps this relationship clear

| Package | Action | Rationale |
|---------|--------|-----------|
| `self-service` | Extend | Already owns the portal UI, routes, and API client infrastructure |
| `backstage-rhaap-common` | Extend | Natural home for shared admin types and permissions |
| `backstage-rhaap-backend` | **New** | No existing backend plugin for portal-level admin concerns |
| `auth-backend-module-rhaap-provider` | Extend | Local admin auth is a mode of the existing RHAAP auth, not a separate provider |

### Package Dependency Graph

```
  Option A (rejected):  3 new packages
  ─────────────────────────────────────

  plugin-portal-admin          ← new frontend
  plugin-portal-admin-backend  ← new backend
  plugin-portal-admin-common   ← new shared types
  auth-backend-module-rhaap-provider (modified)

  Total: 3 new + 1 modified = 4 packages to build, test, deploy


  Option B (chosen):  1 new package
  ──────────────────────────────────

  backstage-rhaap-common (add admin types, permissions)
       │
       ├── backstage-rhaap-backend (NEW)
       │     ├── DatabaseConfigSource
       │     ├── PortalAdminService
       │     └── router.ts (15 API endpoints)
       │
       ├── self-service (add wizard + admin pages)
       │     ├── SetupWizard/*      ← lazy-loaded
       │     ├── AdminPages/*       ← lazy-loaded
       │     ├── SetupGate
       │     └── PortalAdminClient
       │
       └── auth-backend-module-rhaap-provider (add local-admin)
             └── localAdminAuthenticator.ts

  Total: 1 new + 3 modified = 4 packages, but only 1 new artifact
```

### Lazy-Loading Strategy

```
  RouteView.tsx (main bundle)
       │
       ├── HomeComponent          ← eager (always needed)
       ├── CatalogImport          ← eager
       ├── TaskList               ← eager
       │
       ├── SetupWizard            ← React.lazy()  (only setup mode)
       ├── GeneralPage            ← React.lazy()  (admin only)
       ├── ConnectionsPage        ← React.lazy()  (admin only)
       └── RBACPage               ← React.lazy()  (admin only)

  Admin pages are code-split into separate chunks.
  Non-admin users never download admin page code.
```

## Consequences

**Positive:**

- 1 new package instead of 3 — simpler dependency graph, fewer build artifacts
- Admin pages share the same plugin instance, API factories, and route refs as the main self-service UI
- No duplication of common infrastructure (discovery API, fetch API, permission hooks)
- Dynamic plugin deployment requires configuring fewer packages

**Negative:**

- `self-service` plugin grows larger (mitigated by lazy-loading admin pages via `React.lazy()`)
- Admin page imports must avoid pulling in heavy `backstage-rhaap-common` dependencies that break test environments lacking `TextEncoder` (solved by re-declaring permissions locally in `hooks/adminPermissions.ts`)

## Related

- `plugins/self-service/src/plugin.ts` (admin extensions registered here)
- `plugins/self-service/src/components/AdminPages/` (lazy-loaded)
- `plugins/backstage-rhaap-backend/` (the one new package)
