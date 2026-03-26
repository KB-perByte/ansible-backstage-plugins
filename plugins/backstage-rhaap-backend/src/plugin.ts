import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { portalAdminPermissions } from '@ansible/backstage-rhaap-common';
import { createRouter } from './router';
import { DatabaseHandler } from './database/DatabaseHandler';
import { PortalAdminService } from './service/PortalAdminService';
import { RestartService } from './service/RestartService';

export const rhaapBackendPlugin = createBackendPlugin({
  pluginId: 'rhaap-backend',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
        database: coreServices.database,
        httpRouter: coreServices.httpRouter,
        permissions: coreServices.permissions,
        httpAuth: coreServices.httpAuth,
        permissionsRegistry: coreServices.permissionsRegistry,
      },
      async init({
        config,
        logger,
        database,
        httpRouter,
        permissions,
        httpAuth,
        permissionsRegistry,
      }) {
        // Register admin permissions with the permission framework
        permissionsRegistry.addPermissions(portalAdminPermissions);

        // Initialize database
        const knex = await database.getClient();
        const dbHandler = await DatabaseHandler.create(knex as any);

        // Create services
        const restartService = new RestartService({ logger });
        const service = new PortalAdminService({
          config,
          logger,
          dbHandler,
          restartService,
        });

        // Create and mount router
        const router = await createRouter({
          service,
          permissions,
          httpAuth,
          logger,
          config,
        });

        httpRouter.use(router as any);
        httpRouter.addAuthPolicy({
          path: '/setup/status',
          allow: 'unauthenticated',
        });

        logger.info('Portal admin backend plugin initialized');
      },
    });
  },
});
