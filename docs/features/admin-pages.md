# Administration Pages

After the setup wizard is complete, platform administrators can manage the portal through the ADMINISTRATION sidebar section. These pages are permission-gated — only users with the `ansible.admin.view` permission can see them, and `ansible.admin.write` is required for modifications.

## General

**Route**: `/self-service/admin/general`

### Security & Access Control

- **Local Admin Access (Bootstrap)** — Toggle to enable/disable the built-in admin account. Keep disabled unless performing initial setup or emergency recovery when AAP SSO is unavailable.

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

The "Edit" button opens the same form used in the setup wizard, pre-filled with current values. Secrets are shown as masked placeholders.

The "Sync now" button triggers an immediate content sync for the specified provider.

## RBAC & User Groups

**Route**: `/self-service/admin/rbac`

Manage portal permissions for groups synced from external identity providers (AAP).

### User Groups Table

| Column | Description |
|--------|-------------|
| Group name | Link to group details |
| Source | Identity provider origin (e.g., AAP) |
| Members | Number of users in the group |
| Portal Role | Assignable role: Editor, Viewer, Admin |
| Last Sync | When the group was last synced |

Filters: Source (All), Portal Role (All). Search bar and pagination.

Portal Role changes are saved via the existing RHDH RBAC plugin APIs.

## Permissions

| Permission | ID | Description |
|------------|-----|-------------|
| View admin pages | `ansible.admin.view` | See the ADMINISTRATION sidebar section and admin pages |
| Modify settings | `ansible.admin.write` | Edit connections, toggle local admin, trigger sync |

By default, `user:default/admin` and `group:default/aap-admins` (AAP superusers) have both permissions. Additional users/groups can be granted access via RBAC policies.
