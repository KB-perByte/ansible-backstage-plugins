# Setup Wizard

The Ansible Self-Service Portal includes a guided setup wizard for day-0 configuration. When the portal boots for the first time (or when onboarding is enabled), the admin is guided through configuring AAP, content registries, and source control providers.

## Prerequisites

Before starting the setup wizard, ensure you have:

- **AAP Controller URL** — The base URL of your Ansible Automation Platform instance (e.g., `https://aap.example.com`)
- **AAP Personal Access Token** — A token with System Administrator privileges for content discovery and job execution
- **AAP OAuth Application** — Client ID and Client Secret from an OAuth application created in AAP (under Settings > OAuth Applications)
- **SCM Provider Credentials** (optional) — Personal Access Token and OAuth App credentials for GitHub or GitLab

## Enabling the Setup Wizard

The wizard is controlled by the `ansible.portal.onboarding.enabled` configuration flag:

```yaml
# app-config.yaml
ansible:
  portal:
    onboarding:
      enabled: true   # Show setup wizard on first boot
```

| Deployment | Default | Notes |
|------------|---------|-------|
| RHEL Appliance | `true` | Greenfield deployment — wizard is the primary setup method |
| OpenShift (new install) | `true` | Guided setup for new deployments |
| OpenShift (existing) | `false` | Existing deployments already have secrets configured |
| Local Development | `true` | Set in `app-config.local.yaml`. Start with `PORTAL_ADMIN_PASSWORD=admin123 yarn start` |

When onboarding is enabled and setup is not yet complete, the portal auto-logs in as `user:default/admin` via the `local-admin` ProxyAuthenticator and redirects directly to the setup wizard. No login form is shown during initial setup mode.

After setup is complete, if local admin is re-enabled (for emergency recovery), the sign-in page shows both a Local Admin login card (with password form) and the AAP OAuth button — the admin must enter credentials explicitly.

## Wizard Steps

### Step 1: Overview

Displays prerequisites and what information you'll need. No input required.

### Step 2: Connect AAP

| Field | Required | Description |
|-------|----------|-------------|
| AAP Controller URL | Yes | HTTPS URL of your AAP Controller |
| Admin Personal Access Token | Yes | Service token for content discovery and job execution |
| Client ID | Yes | OAuth Client ID from AAP application settings |
| Client Secret | Yes | OAuth Client Secret |

### Step 3: Connect Registries

Configure content sources:

- **Private Automation Hub (PAH)** — Toggle on/off. Can inherit credentials from AAP or use standalone URL/token.
- **Red Hat Certified Content** — Toggle for certified partner collections (AWS, Microsoft, Cisco)
- **Red Hat Validated Content** — Toggle for Red Hat-developed patterns
- **Ansible Galaxy** — Toggle for community content

### Step 4: Connect Source Control (Recommended)

Connect GitHub and/or GitLab for content discovery and user SSO:

- **Service Access** — Provider URL + PAT for discovering Ansible content in repositories
- **Discovery Scope** — Target organizations, EE definition filename, branches, crawl depth
- **User Sign-in (SSO)** — OAuth Client ID/Secret for users to push scaffolded repositories

### Step 5: Review & Apply

Review all configured settings. Secrets are masked. Click "Apply & Restart Portal" to finalize.

## After Setup

After the wizard completes:

1. The portal restarts with the new configuration
2. AAP OAuth login becomes active
3. The admin logs in with their AAP credentials
4. The ADMINISTRATION sidebar section appears with:
   - **General** — Local admin toggle for emergency recovery
   - **Connections** — Edit/sync all configured connections
   - **RBAC** — Manage user groups and portal roles

## Local Development

Start the portal in setup mode:

```bash
PORTAL_ADMIN_PASSWORD=admin123 yarn start
```

Reset to setup mode (re-run the wizard):

```bash
rm -rf packages/backend/portal-dev-db && PORTAL_ADMIN_PASSWORD=admin123 yarn start
```

The local SQLite database is stored in `packages/backend/portal-dev-db/`. Deleting this directory resets all setup state.

## API-Based Setup (Config-as-Code)

All setup steps can be automated via REST API. See [Config-as-Code documentation](./config-as-code.md).
