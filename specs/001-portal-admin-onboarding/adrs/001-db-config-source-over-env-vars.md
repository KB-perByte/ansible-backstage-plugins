# ADR-001: Database ConfigSource Over Environment Variables

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Portal team

## Context

The portal needs to store configuration (AAP credentials, SCM tokens, registry settings) that was entered through the setup wizard UI. This config must be readable by existing Backstage community plugins (auth, catalog, scaffolder) without modifying their code.

Three approaches were considered:

1. **Environment variables**: Write config to `.env` files and restart with new env vars
2. **ConfigMap/Secret patching**: Write to Kubernetes ConfigMaps/Secrets and restart
3. **Database ConfigSource**: Store config in a DB table and inject it into Backstage's config system via a custom `ConfigSource`

## Alternatives Considered

### Option 1: Environment Variables (Rejected)

Write config to `.env` files on disk and restart the backend with new env vars.

**Why rejected:**
- On the RHEL appliance, the portal runs as a rootless Podman container. Writing `.env` files from inside the container requires bind-mounting host paths and managing file ownership — fragile across upgrades
- Environment variables are flat strings. Backstage config is deeply nested (`auth.providers.rhaap.production.clientId`). Mapping flat env vars to nested config paths requires the same `configTreeBuilder` logic we'd need anyway
- No built-in encryption at rest — secrets sit in plain text in `.env` files on disk
- No transactional updates — partially written `.env` files during a crash leave config in a broken state

### Option 2: Platform-Native Config and Secret Stores (Rejected)

Write config to each platform's native storage, then restart:

- **OpenShift**: Patch Kubernetes ConfigMaps for non-sensitive config and K8s Secrets for credentials, then trigger a pod rollout
- **RHEL appliance**: Write non-sensitive config to `/etc/portal/.portal.env` or `app-config.yaml` overrides on the filesystem, store credentials as Podman secrets (via `podman secret create`), then restart the systemd service

**Why rejected:**

- **Two completely different code paths**: OpenShift uses the K8s API (`kubectl patch configmap`, `kubectl create secret`) while RHEL uses Podman secrets (`podman secret create`) and filesystem writes (`/etc/portal/.portal.env`). The setup wizard backend would need platform-specific branches for every config save operation — doubling the implementation and test surface
- **OpenShift RBAC escalation**: The portal pod would need permissions to patch its own ConfigMap and create/update Secrets. Cluster admins may not grant this, and it violates the principle of least privilege
- **RHEL filesystem complexity**: Writing to `app-config.yaml` or `.portal.env` from inside a rootless Podman container requires bind-mounting the host config directory with write permissions. Podman secrets are injected as environment variables at container start (`Secret=portal_admin_password_hash,type=env,target=PORTAL_ADMIN_PASSWORD_HASH` in the Quadlet file) — they cannot be updated while the container is running without recreating it via `podman secret rm` + `podman secret create` + `systemctl restart`
- **No transactional updates**: ConfigMaps/Secrets and Podman secrets/env files are updated independently. If the process crashes between writing the AAP URL and the AAP token, config is left in a half-updated state. The database approach uses a single transaction per category
- **Restart still required**: Both ConfigMap changes and Podman secret updates require a full service restart for Backstage to pick up the new values — no latency advantage over the database approach
- **Inconsistent encryption at rest**: K8s Secrets are base64-encoded (not encrypted) unless cluster-level etcd encryption is configured — outside the portal's control. Podman secrets are stored on the host filesystem at `~/.local/share/containers/storage/secrets/` with file permissions as the only protection. The database approach encrypts all secrets with AES-256-GCM regardless of the deployment platform

### Option 3: Augment Plugin Pattern (Considered, partially adopted)

The RHDH `augment` plugin uses an `AdminConfigService` with a similar DB-over-YAML pattern. We studied it for reference.

**Why not adopted directly:**
- The augment plugin's `AdminConfigService` is tightly coupled to RHDH's internal plugin system and not published as a reusable library
- Its config merging is simpler — it doesn't handle the config key transformation needed to map portal-specific keys (`aap.controller_url`) to Backstage-standard paths (`ansible.rhaap.baseUrl`, `integrations.github[0].host`)
- However, the overall pattern (DB > YAML, `ConfigSource` interface, bootstrap connection) was adopted

## Decision

Use a **Database ConfigSource** (`DatabaseConfigSource`) that stores configuration in a `portal_config` table and injects it into Backstage's `rootConfig` service at startup. DB config overrides static `app-config.yaml` values.

The merge order is: `app-config.yaml` < `env vars` < **database config** (later wins).

A `configTreeBuilder` transforms flat DB rows (e.g., `aap.controller_url`) into the nested config structure that Backstage plugins expect (e.g., `ansible.rhaap.baseUrl`).

**Why this approach wins:**
- Works on all three deployment targets (local dev, RHEL appliance, OpenShift) with the same code path
- The database already exists in all deployments (SQLite for dev, PostgreSQL for production) — no new infrastructure
- Backstage's `ConfigSource` interface is the official extension point for custom config providers — we're using the framework as intended
- Secrets get AES-256-GCM encryption at rest, managed by the portal rather than delegated to external systems
- The UI and API can read and write config through the same `PortalAdminService` — a single code path for both the wizard and management commands

### Startup Flow

```
                    ┌──────────────────────────────┐
                    │  createRootConfigWithDatabase │
                    │  Source() — runs BEFORE any   │
                    │  plugin initializes           │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │                              │
                    ▼                              ▼
        ┌───────────────────┐         ┌────────────────────────┐
        │  Default Config   │         │  Bootstrap Connection  │
        │  Source           │         │                        │
        │                   │         │  Reads DB connection   │
        │  app-config.yaml  │         │  from raw YAML files   │
        │  app-config.local │         │  (bypasses Backstage)  │
        │  ENV vars         │         │  → Knex instance       │
        └────────┬──────────┘         └───────────┬────────────┘
                 │                                │
                 │                                ▼
                 │                    ┌────────────────────────┐
                 │                    │  DatabaseConfigSource  │
                 │                    │                        │
                 │                    │  SELECT * FROM         │
                 │                    │    portal_config       │
                 │                    │  → decrypt secrets     │
                 │                    │    (AES-256-GCM)       │
                 │                    └───────────┬────────────┘
                 │                                │
                 │                                ▼
                 │                    ┌────────────────────────┐
                 │                    │  configTreeBuilder     │
                 │                    │                        │
                 │                    │  Flat DB rows:         │
                 │                    │   aap.controller_url   │
                 │                    │   scm.github.token     │
                 │                    │       ↓                │
                 │                    │  Nested config:        │
                 │                    │   ansible.rhaap.baseUrl│
                 │                    │   integrations.github  │
                 │                    │     [0].token          │
                 │                    └───────────┬────────────┘
                 │                                │
                 ▼                                ▼
        ┌─────────────────────────────────────────────────┐
        │        ConfigSources.merge([default, db])       │
        │                                                 │
        │        DB config OVERRIDES static config        │
        └──────────────────────┬──────────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────────┐
        │        Standard Backstage Config object         │
        │        (rootConfig service)                     │
        └──────┬──────────┬──────────┬────────────────────┘
               │          │          │
               ▼          ▼          ▼
          ┌────────┐ ┌────────┐ ┌──────────┐
          │  auth  │ │catalog │ │scaffolder│  ← No code changes
          │ plugin │ │ plugin │ │  plugin  │     needed
          └────────┘ └────────┘ └──────────┘
```

### Config Key Mapping

```
  portal_config table                    Backstage config tree
  ─────────────────                      ─────────────────────

  aap.controller_url ──────────────────► ansible.rhaap.baseUrl
  aap.admin_token ─────────────────────► ansible.rhaap.token
  aap.oauth_client_id ─────────────────► auth.providers.rhaap.<env>.clientId
  aap.oauth_client_secret ─────────────► auth.providers.rhaap.<env>.clientSecret

  scm.github.provider_url ─────────────► integrations.github[0].host
  scm.github.token ────────────────────► integrations.github[0].token
  scm.github.oauth_client_id ──────────► auth.providers.github.<env>.clientId
  scm.github.oauth_client_secret ──────► auth.providers.github.<env>.clientSecret
```

## Consequences

**Positive:**

- Community plugins (GitHub/GitLab integrations, auth providers) work without code changes — they read config through the standard `config.getString()` interface
- Config persists across restarts without external secret management
- Single source of truth in the database, manageable via both UI and API
- Secrets encrypted at rest with AES-256-GCM

**Negative:**

- Chicken-and-egg problem: `DatabaseConfigSource` needs a DB connection, but Backstage's DB service depends on `rootConfig`. Solved with a **bootstrap connection** that reads DB config directly from raw YAML files, bypassing Backstage's config system
- Config changes for community plugins require a backend restart to take effect (the `rootConfig` is read once at startup). AAP auth is an exception — it has a 60-second TTL cache for hot-reload
- Adds complexity vs simple env vars, but env vars don't work for UI-driven config on RHEL appliance mode

## Related

- `plugins/backstage-rhaap-backend/src/config/DatabaseConfigSource.ts`
- `plugins/backstage-rhaap-backend/src/config/configTreeBuilder.ts`
- `plugins/backstage-rhaap-backend/src/config/rootConfigOverride.ts`
- `plugins/backstage-rhaap-backend/src/config/bootstrapConnection.ts`
