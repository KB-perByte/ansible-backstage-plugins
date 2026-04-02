# Administration Pages

After the setup wizard is complete, platform administrators can manage the portal through the ADMINISTRATION sidebar section. These pages are permission-gated — only users with the `ansible.admin.view` permission can see them, and `ansible.admin.write` is required for modifications.

## Connections

**Route**: `/self-service/admin/connections`

Manage integrations with external platforms for content discovery and user authentication (SSO).

### Automation & Content Platforms

| Card | Features |
|------|----------|
| **Ansible Automation Platform (AAP)** | Content discovery status, Login (SSO) status, Host, Auth method. Edit and Sync now buttons. |
| **Private Automation Hub (PAH)** | Content discovery status, credential source (inherited from AAP or standalone). Edit and Sync now buttons. |
| **Public Registers** | Toggles for Red Hat Certified Content, Validated Content, and Ansible Galaxy. |

### Source Control Providers

| Card | Features |
|------|----------|
| **GitHub** | Content discovery status, Login (SSO) status, Host. Edit/Connect and Sync now buttons. |
| **GitLab** | Same structure as GitHub. |

The "Edit" button opens the same form used in the setup wizard, pre-filled with current values. Secret fields (tokens, passwords) are shown as empty with "Leave blank to keep current value" — existing secrets in the database are preserved when left blank.

The "Sync now" button triggers an immediate content sync for the specified provider, with a snackbar notification showing success or failure. Sync is proxied to the catalog backend module via service-to-service authentication.

## RBAC & User Groups

**Route**: `/self-service/admin/rbac`

Manage portal permissions for groups synced from external identity providers (AAP). Wraps the existing RHDH RBAC plugin interface.

## Local Admin Access

Local admin access (for initial setup and emergency recovery) is managed via CLI or API only — there is no UI toggle. This follows the enterprise pattern where break-glass access is an infrastructure operation, not a casual UI action.

**Local development:**
```bash
yarn portal-admin set-local-admin --enable
yarn portal-admin set-local-admin --disable
```

**RHEL appliance:**
```bash
sudo portal-config set LOCAL_ADMIN_ENABLED=true
sudo systemctl restart portal.service
```

**OpenShift / API:**
```bash
curl -X PUT .../api/rhaap-backend/general/local-admin \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"enabled": true}'
```

## Permissions

| Permission | ID | Description |
|------------|-----|-------------|
| View admin pages | `ansible.admin.view` | See the ADMINISTRATION sidebar section and admin pages |
| Modify settings | `ansible.admin.write` | Edit connections, trigger sync |

By default, `user:default/admin` and `group:default/aap-admins` (AAP superusers) have both permissions. Additional users/groups can be granted access via RBAC policies.
