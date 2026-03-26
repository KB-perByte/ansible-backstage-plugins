import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'self-service',
});

export const catalogImportRouteRef = createSubRouteRef({
  id: 'self-service/catalog-import',
  parent: rootRouteRef,
  path: '/catalog-import',
});

export const selectedTemplateRouteRef = createSubRouteRef({
  id: 'self-service/selected-template',
  parent: rootRouteRef,
  path: '/create/templates/:namespace/:templateName',
});

export const createTaskRouteRef = createSubRouteRef({
  id: 'self-service/task',
  parent: rootRouteRef,
  path: '/create/tasks/:taskId',
});

export const setupRouteRef = createRouteRef({
  id: 'self-service/setup',
});

export const adminGeneralRouteRef = createSubRouteRef({
  id: 'self-service/admin/general',
  parent: rootRouteRef,
  path: '/admin/general',
});

export const adminConnectionsRouteRef = createSubRouteRef({
  id: 'self-service/admin/connections',
  parent: rootRouteRef,
  path: '/admin/connections',
});

export const adminRbacRouteRef = createSubRouteRef({
  id: 'self-service/admin/rbac',
  parent: rootRouteRef,
  path: '/admin/rbac',
});
