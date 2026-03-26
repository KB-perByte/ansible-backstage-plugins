import { createPermission } from '@backstage/plugin-permission-common';

/**
 * Local re-declaration of admin permissions to avoid importing from
 * @ansible/backstage-rhaap-common barrel which pulls in AAPClient → undici
 * and breaks test environments without TextEncoder polyfill.
 *
 * These MUST stay in sync with the canonical definitions in
 * @ansible/backstage-rhaap-common/src/admin/permissions.ts
 */
export const portalAdminViewPermission = createPermission({
  name: 'ansible.admin.view',
  attributes: { action: 'read' },
});

export const portalAdminWritePermission = createPermission({
  name: 'ansible.admin.write',
  attributes: { action: 'create' },
});
