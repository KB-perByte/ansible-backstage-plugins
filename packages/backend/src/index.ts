/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';
import { createRootConfigWithDatabaseSource } from '@ansible/backstage-rhaap-backend';

const backend = createBackend();

// Override rootConfig to merge DB-stored config with static app-config.yaml.
// DB values override static config — enables setup wizard to configure auth providers.
backend.add(createRootConfigWithDatabaseSource());

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-gitlab'));
backend.add(import('@backstage/plugin-techdocs-backend'));

// auth plugin — RHAAP provider with integrated local-admin for setup/recovery
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(
  import('@ansible/backstage-plugin-auth-backend-module-rhaap-provider'),
);

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// See https://backstage.io/docs/permissions/getting-started for how to create your own permission policy
// backend.add(
//   import('@backstage/plugin-permission-backend-module-allow-all-policy'),
// );
// permission plugin
// backend.add(import('@backstage/plugin-permission-backend'));
backend.add(import('@backstage-community/plugin-rbac-backend'));

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search engine
// See https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes
backend.add(import('@backstage/plugin-kubernetes-backend'));

backend.add(import('@ansible/backstage-plugin-catalog-backend-module-rhaap'));
backend.add(
  import('@ansible/plugin-scaffolder-backend-module-backstage-rhaap'),
);

// portal admin backend — setup wizard, connections, config management
backend.add(import('@ansible/backstage-rhaap-backend'));

backend.start();
