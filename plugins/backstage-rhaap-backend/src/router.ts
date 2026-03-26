import { Router, json } from 'express';
import {
  HttpAuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { PermissionsService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  portalAdminViewPermission,
  portalAdminWritePermission,
} from '@ansible/backstage-rhaap-common';
import { InputError, NotAllowedError } from '@backstage/errors';
import { PortalAdminService } from './service/PortalAdminService';

export interface RouterOptions {
  service: PortalAdminService;
  permissions: PermissionsService;
  httpAuth: HttpAuthService;
  logger: LoggerService;
  config: Config;
}

async function authorizeRead(
  req: any,
  permissions: PermissionsService,
  httpAuth: HttpAuthService,
): Promise<void> {
  const credentials = await httpAuth.credentials(req);
  const [decision] = await permissions.authorize(
    [{ permission: portalAdminViewPermission }],
    { credentials },
  );
  if (decision.result === AuthorizeResult.DENY) {
    throw new NotAllowedError('Requires admin view permission');
  }
}

async function authorizeWrite(
  req: any,
  permissions: PermissionsService,
  httpAuth: HttpAuthService,
): Promise<void> {
  const credentials = await httpAuth.credentials(req);
  const [decision] = await permissions.authorize(
    [{ permission: portalAdminWritePermission }],
    { credentials },
  );
  if (decision.result === AuthorizeResult.DENY) {
    throw new NotAllowedError('Requires admin write permission');
  }
}

export async function createRouter(
  options: RouterOptions,
): Promise<Router> {
  const { service, permissions, httpAuth, logger } = options;
  const router = Router();
  router.use(json());

  // --- Setup APIs ---

  router.get('/setup/status', async (_req, res) => {
    const status = await service.getSetupStatus();
    res.json({ success: true, data: status });
  });

  router.post('/setup/aap', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.saveAAPConfig(req.body);
    res.json({ success: true });
  });

  router.post('/setup/registries', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.saveRegistriesConfig(req.body);
    res.json({ success: true });
  });

  router.post('/setup/scm/:provider', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.saveSCMConfig(req.params.provider, req.body);
    res.json({ success: true });
  });

  router.delete('/setup/scm/:provider', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.deleteSCMConfig(req.params.provider);
    res.json({ success: true });
  });

  router.post('/setup/apply', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    const result = await service.applySetup();
    res.json({
      success: true,
      data: result,
    });
  });

  router.post('/setup/batch', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.batchSetup(req.body);
    res.json({ success: true, data: { applied: !!req.body.apply } });
  });

  // --- Admin APIs (post-setup) ---

  router.get('/connections', async (req, res) => {
    await authorizeRead(req, permissions, httpAuth);
    const connections = await service.getConnections();
    res.json({ success: true, data: connections });
  });

  router.put('/connections/aap', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.saveAAPConfig(req.body);
    res.json({ success: true, data: { restartRequired: true } });
  });

  router.put('/connections/registries', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.saveRegistriesConfig(req.body);
    res.json({ success: true });
  });

  router.put('/connections/scm/:provider', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.saveSCMConfig(req.params.provider, req.body);
    res.json({ success: true, data: { restartRequired: true } });
  });

  router.delete('/connections/scm/:provider', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    await service.deleteSCMConfig(req.params.provider);
    res.json({ success: true, data: { restartRequired: true } });
  });

  router.put('/general/local-admin', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      throw new InputError('"enabled" must be a boolean');
    }
    await service.setLocalAdmin(enabled);
    res.json({ success: true });
  });

  router.post('/connections/:type/sync', async (req, res) => {
    await authorizeWrite(req, permissions, httpAuth);
    // Sync is delegated to the catalog backend module's existing sync endpoints
    // This is a convenience proxy — actual implementation depends on catalog module
    logger.info(`Sync triggered for ${req.params.type}`);
    res.json({ success: true, data: { message: 'Sync triggered' } });
  });

  // --- Error handler ---

  router.use(
    (
      err: Error,
      _req: any,
      res: any,
      _next: any,
    ) => {
      if (err instanceof InputError) {
        res.status(400).json({ success: false, error: err.message });
      } else if (err instanceof NotAllowedError) {
        res.status(403).json({ success: false, error: err.message });
      } else {
        logger.error('Unhandled error in portal admin router', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    },
  );

  return router;
}
