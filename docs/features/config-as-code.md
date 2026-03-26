# Config-as-Code API

All portal setup and administration can be automated via REST API, enabling CI/CD pipeline provisioning and agentic AI integration.

## Authentication

During setup mode, authenticate with the local admin credentials. Post-setup, use an AAP-authenticated user with admin RBAC permissions.

```bash
# Get admin password (OpenShift)
ADMIN_PASS=$(kubectl get secret rhaap-portal-admin-credentials \
  -o jsonpath='{.data.password}' | base64 -d)

# Authenticate (get Backstage token)
TOKEN="<backstage-auth-token>"
```

## Setup API Endpoints

### Check Status

```bash
curl -s https://portal.example.com/api/rhaap-backend/setup/status | jq
# { "success": true, "data": { "onboardingEnabled": true, "setupComplete": false, ... } }
```

### Configure AAP (Required)

```bash
curl -X POST https://portal.example.com/api/rhaap-backend/setup/aap \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "controllerUrl": "https://aap.example.com",
    "adminToken": "my-aap-personal-access-token",
    "clientId": "portal-oauth-app-client-id",
    "clientSecret": "portal-oauth-app-client-secret",
    "checkSSL": true
  }'
```

### Configure Registries (Optional)

```bash
curl -X POST https://portal.example.com/api/rhaap-backend/setup/registries \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "pahEnabled": true,
    "pahInheritAap": true,
    "certifiedContent": true,
    "validatedContent": true,
    "galaxyEnabled": true
  }'
```

### Configure GitHub (Optional)

```bash
curl -X POST https://portal.example.com/api/rhaap-backend/setup/scm/github \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "providerUrl": "https://github.com",
    "token": "ghp_service_account_pat",
    "targetOrgs": "my-org,team-automation",
    "eeFilename": "execution-environment.yml",
    "branches": "main",
    "maxDepth": 5,
    "oauthClientId": "Iv1.github_oauth_app_id",
    "oauthClientSecret": "github_oauth_secret"
  }'
```

### Configure GitLab (Optional)

```bash
curl -X POST https://portal.example.com/api/rhaap-backend/setup/scm/gitlab \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "providerUrl": "https://gitlab.com",
    "token": "glpat-service_account_pat",
    "targetOrgs": "my-group"
  }'
```

### Apply & Finalize

```bash
curl -X POST https://portal.example.com/api/rhaap-backend/setup/apply \
  -H "Authorization: Bearer $TOKEN"
# { "success": true, "data": { "restartTriggered": true, "deploymentMode": "openshift" } }
```

After this call, the portal restarts. On OpenShift, a rolling restart is triggered automatically. On RHEL, systemd restarts the service.

## Batch Setup (Single Call)

Configure everything in one atomic request:

```bash
curl -X POST https://portal.example.com/api/rhaap-backend/setup/batch \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "aap": {
      "controllerUrl": "https://aap.example.com",
      "adminToken": "my-token",
      "clientId": "my-client-id",
      "clientSecret": "my-secret"
    },
    "registries": {
      "pahEnabled": true,
      "pahInheritAap": true,
      "certifiedContent": true,
      "validatedContent": true,
      "galaxyEnabled": true
    },
    "scm": {
      "github": {
        "providerUrl": "https://github.com",
        "token": "ghp_xxx",
        "targetOrgs": "my-org"
      }
    },
    "apply": true
  }'
```

If `apply: true`, the setup is finalized and restart triggered in the same call. If any section fails validation, nothing is saved (atomic).

## Admin API Endpoints (Post-Setup)

### View Connections

```bash
curl -s https://portal.example.com/api/rhaap-backend/connections \
  -H "Authorization: Bearer $TOKEN" | jq
```

Note: Secrets are never returned — only presence indicators (e.g., `"hasAdminToken": true`).

### Update a Connection

```bash
curl -X PUT https://portal.example.com/api/rhaap-backend/connections/aap \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "controllerUrl": "https://new-aap.example.com", ... }'
```

### Trigger Manual Sync

```bash
curl -X POST https://portal.example.com/api/rhaap-backend/connections/aap/sync \
  -H "Authorization: Bearer $TOKEN"
```

### Toggle Local Admin Access

```bash
curl -X PUT https://portal.example.com/api/rhaap-backend/general/local-admin \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{ "enabled": true }'
```

## OpenAPI Specification

The full OpenAPI 3.1 spec is available at runtime:

```bash
curl -s https://portal.example.com/api/rhaap-backend/openapi.json | jq .info
```

The spec is also committed to the repository at `plugins/backstage-rhaap-backend/src/schema/openapi.yaml`.

## Response Format

All endpoints return a consistent envelope:

```json
{
  "success": true,
  "data": { ... }
}
```

On error:

```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

HTTP status codes:
- `200` — Success
- `400` — Validation error (check `error` field)
- `403` — Insufficient permissions
- `500` — Internal server error
