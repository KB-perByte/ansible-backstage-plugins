import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Permission to view admin pages (General, Connections, RBAC)
 * and see the ADMINISTRATION sidebar items.
 */
export const portalAdminViewPermission = createPermission({
  name: 'ansible.admin.view',
  attributes: { action: 'read' },
});

/**
 * Permission to modify settings — toggle local admin, edit connections,
 * trigger sync, run setup wizard.
 */
export const portalAdminWritePermission = createPermission({
  name: 'ansible.admin.write',
  attributes: { action: 'create' },
});

/**
 * All portal admin permissions, exported for backend registration
 * via `permissionsRegistry.addPermissions()`.
 */
export const portalAdminPermissions = [
  portalAdminViewPermission,
  portalAdminWritePermission,
];
