# ADR-006: Partial Secret Updates on Connection Edit

**Status**: Accepted
**Date**: 2026-04-01
**Deciders**: Portal team

## Context

When an admin edits a connection (e.g., AAP) via the Connections page, the edit modal pre-fills non-secret fields (URL, client ID) from the API, but secret fields (admin token, client secret) are masked and shown as empty with "Leave blank to keep current value" placeholders.

The original `saveAAPConfig()` method validated all fields as required, including secrets. This caused a 400 error when editing a connection without re-entering secrets.

## Alternatives Considered

### Option 1: Separate `updateAAPConfig()` Service Method (Rejected)

Create a distinct `updateAAPConfig()` method that only validates and upserts fields that are present, separate from `saveAAPConfig()`.

**Why rejected:**

- **Code duplication**: The config-to-DB mapping logic (which keys to upsert, which are secrets, which category) would be duplicated between `saveAAPConfig` and `updateAAPConfig`. When a new field is added, both methods must be updated
- **API surface expansion**: Adding separate update methods for AAP, SCM, and registries means 3 new service methods, 3 new router handlers, and 3 new OpenAPI operations — significant surface area for what is a minor behavioral difference (required vs optional secrets)

### Option 2: Send Secrets Back from GET /connections (Rejected)

Return actual secret values (decrypted) from the `GET /connections` endpoint so the edit modal can pre-fill them and send them back unchanged.

**Why rejected:**

- **Security violation**: Exposing decrypted secrets over HTTP means they appear in browser network tabs, proxy logs, and can be captured by browser extensions. The current design returns only boolean flags (`hasAdminToken: true`) — never the actual values
- **Unnecessary exposure**: If the admin isn't changing a secret, there's no reason for it to leave the database at all

### Option 3: Require All Fields on Every Edit (Rejected)

Force the admin to re-enter all secrets every time they edit any field.

**Why rejected:**

- **Terrible UX**: Editing a URL shouldn't require looking up and re-entering API tokens and OAuth secrets. Admins may not have the secrets readily available — they may have been set by a different person or generated during initial setup
- **Error-prone**: Re-entering secrets creates opportunities for typos. A mistyped OAuth client secret would break SSO for all users

## Decision

Add an `allowPartialSecrets` option to `saveAAPConfig()` and `saveSCMConfig()`.

**Why this approach wins:**

- **Single code path**: The same `saveAAPConfig()` method handles both setup and edit. The `allowPartialSecrets` flag is the only behavioral difference — no logic duplication
- **Secure by default**: Setup endpoints (`POST /setup/aap`) require all fields. Edit endpoints (`PUT /connections/aap`) opt into partial secrets. You can't accidentally skip secrets during initial configuration
- **Clean separation**: The backend enforces the contract. The frontend just sends what it has — empty strings for unchanged secrets. The backend decides whether to skip or reject based on the endpoint being called

### Setup vs Edit Behavior

```
  POST /setup/aap (initial setup)
  ────────────────────────────────

  All fields required:
  ┌──────────────────┬────────────┬──────────────────┐
  │ Field            │ Required?  │ Validation       │
  ├──────────────────┼────────────┼──────────────────┤
  │ controllerUrl    │ yes        │ valid HTTPS URL  │
  │ adminToken       │ yes        │ non-empty        │
  │ clientId         │ yes        │ non-empty        │
  │ clientSecret     │ yes        │ non-empty        │
  └──────────────────┴────────────┴──────────────────┘

  No prior values exist → every field must be provided.


  PUT /connections/aap (edit existing)
  ─────────────────────────────────────

  Secrets optional (allowPartialSecrets: true):
  ┌──────────────────┬────────────┬──────────────────────────────┐
  │ Field            │ Required?  │ Behavior when empty          │
  ├──────────────────┼────────────┼──────────────────────────────┤
  │ controllerUrl    │ yes        │ (must be provided)           │
  │ adminToken       │ no         │ existing DB value preserved  │
  │ clientId         │ yes        │ (must be provided)           │
  │ clientSecret     │ no         │ existing DB value preserved  │
  └──────────────────┴────────────┴──────────────────────────────┘

  Prior encrypted values exist in DB → skip upsert if empty.
```

### Data Flow on Edit

```
  Edit AAP Modal                  rhaap-backend              portal_config DB
  ──────────────                  ──────────────             ────────────────

  GET /connections
       │
       │◄─── { controllerUrl: "https://aap.example.com",
       │       clientId: "my-client",
       │       hasAdminToken: true,        ← boolean, not the actual value
       │       hasClientSecret: true }     ← boolean, not the actual value
       │
  Modal pre-fills:
    controllerUrl = "https://aap.example.com"
    clientId      = "my-client"
    adminToken    = ""  (placeholder: "Leave blank to keep current value")
    clientSecret  = ""  (placeholder: "Leave blank to keep current value")
       │
  Admin changes URL only,
  leaves secrets blank
       │
       │  PUT /connections/aap
       │  { controllerUrl: "https://new-aap.example.com",
       │    clientId: "my-client",
       │    adminToken: "",
       │    clientSecret: "" }
       │
       ▼
  saveAAPConfig(body, { allowPartialSecrets: true })
       │
       ├── upsert controllerUrl ──────────────────────► updated
       ├── adminToken is empty → skip ────────────────► preserved (encrypted)
       ├── upsert clientId ───────────────────────────► updated
       └── clientSecret is empty → skip ──────────────► preserved (encrypted)
```

## Consequences

**Positive:**

- Admins can update non-secret fields (URL, client ID, SSL toggle) without re-entering secrets
- Existing encrypted secrets in the database are never accidentally overwritten with empty values
- Same service method handles both setup and edit — no code duplication

**Negative:**

- Slightly more complex validation logic with the `options` parameter
- Frontend must clearly indicate that empty secret fields mean "keep current" vs "not configured" — solved with placeholder text

## Related

- `plugins/backstage-rhaap-backend/src/service/PortalAdminService.ts` (saveAAPConfig, saveSCMConfig)
- `plugins/backstage-rhaap-backend/src/router.ts` (PUT endpoints pass allowPartialSecrets)
- `plugins/self-service/src/components/AdminPages/EditAAPModal.tsx`
