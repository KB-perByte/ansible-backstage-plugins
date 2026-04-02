import express from 'express';
import request from 'supertest';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { InputError } from '@backstage/errors';
import { createRouter } from './router';
import type { PortalAdminService } from './service/PortalAdminService';

// --- Mock factories ---

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as any;
}

function createMockPermissions(result = AuthorizeResult.ALLOW) {
  return {
    authorize: jest.fn().mockResolvedValue([{ result }]),
    authorizeConditional: jest.fn(),
  } as any;
}

function createMockHttpAuth() {
  return {
    credentials: jest.fn().mockResolvedValue({
      principal: { type: 'user', userEntityRef: 'user:default/admin' },
    }),
    issueUserCookie: jest.fn(),
  } as any;
}

function createMockService(overrides: Partial<PortalAdminService> = {}) {
  return {
    getSetupStatus: jest.fn().mockResolvedValue({
      onboardingEnabled: true,
      setupComplete: false,
      localAdminEnabled: true,
      deploymentMode: 'local',
    }),
    saveAAPConfig: jest.fn().mockResolvedValue(undefined),
    saveRegistriesConfig: jest.fn().mockResolvedValue(undefined),
    saveSCMConfig: jest.fn().mockResolvedValue(undefined),
    deleteSCMConfig: jest.fn().mockResolvedValue(undefined),
    applySetup: jest.fn().mockResolvedValue({
      restartTriggered: false,
      deploymentMode: 'local',
    }),
    batchSetup: jest.fn().mockResolvedValue(undefined),
    getConnections: jest.fn().mockResolvedValue({
      aap: {
        controllerUrl: 'https://aap.example.com',
        hasAdminToken: true,
        clientId: 'test-client',
        hasClientSecret: true,
        checkSSL: false,
        status: { configured: true, contentDiscovery: 'active', sso: 'active' },
      },
      registries: {
        pahEnabled: true,
        pahInheritAap: true,
        hasPahToken: false,
        certifiedContent: true,
        validatedContent: true,
        galaxyEnabled: true,
      },
      scm: {
        github: {
          configured: true,
          providerUrl: 'https://github.com',
          hasToken: true,
          status: { configured: true, contentDiscovery: 'active', sso: 'active' },
        },
        gitlab: {
          configured: false,
          hasToken: false,
          status: { configured: false },
        },
      },
    }),
    setLocalAdmin: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function createMockDiscovery() {
  return {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/catalog'),
    getExternalBaseUrl: jest.fn(),
  } as any;
}

function createMockAuth() {
  return {
    getPluginRequestToken: jest
      .fn()
      .mockResolvedValue({ token: 'mock-service-token' }),
    authenticate: jest.fn(),
    getNoneCredentials: jest.fn(),
    getOwnServiceCredentials: jest.fn(),
    isPrincipal: jest.fn(),
    getLimitedUserToken: jest.fn(),
  } as any;
}

async function createTestApp(overrides: {
  service?: any;
  permissions?: any;
  httpAuth?: any;
} = {}) {
  const logger = createMockLogger();
  const service = overrides.service ?? createMockService();
  const permissions = overrides.permissions ?? createMockPermissions();
  const httpAuth = overrides.httpAuth ?? createMockHttpAuth();
  const discovery = createMockDiscovery();
  const auth = createMockAuth();

  const router = await createRouter({
    service,
    permissions,
    httpAuth,
    logger,
    config: {} as any,
    discovery,
    auth,
  });

  const app = express();
  app.use(router);

  return { app, service, permissions, httpAuth, logger, discovery, auth };
}

// --- Tests ---

describe('portal admin router', () => {
  // ---- Setup APIs ----

  describe('GET /setup/status', () => {
    it('returns setup status without auth', async () => {
      const { app } = await createTestApp();

      const res = await request(app).get('/setup/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          onboardingEnabled: true,
          setupComplete: false,
          localAdminEnabled: true,
          deploymentMode: 'local',
        },
      });
    });
  });

  describe('POST /setup/aap', () => {
    const aapConfig = {
      controllerUrl: 'https://aap.example.com',
      adminToken: 'test-token',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      checkSSL: false,
    };

    it('saves AAP config when authorized', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app).post('/setup/aap').send(aapConfig);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(service.saveAAPConfig).toHaveBeenCalledWith(aapConfig);
    });

    it('returns 403 when unauthorized', async () => {
      const { app } = await createTestApp({
        permissions: createMockPermissions(AuthorizeResult.DENY),
      });

      const res = await request(app).post('/setup/aap').send(aapConfig);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 on validation error', async () => {
      const service = createMockService({
        saveAAPConfig: jest
          .fn()
          .mockRejectedValue(new InputError('controllerUrl is required')),
      } as any);
      const { app } = await createTestApp({ service });

      const res = await request(app).post('/setup/aap').send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /setup/registries', () => {
    const registriesConfig = {
      pahEnabled: true,
      pahInheritAap: true,
      certifiedContent: true,
      validatedContent: true,
      galaxyEnabled: true,
    };

    it('saves registries config', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app)
        .post('/setup/registries')
        .send(registriesConfig);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(service.saveRegistriesConfig).toHaveBeenCalledWith(registriesConfig);
    });
  });

  describe('POST /setup/scm/:provider', () => {
    const scmConfig = {
      providerUrl: 'https://github.com',
      token: 'ghp_test123',
      targetOrgs: 'my-org',
    };

    it('saves SCM config for github', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app)
        .post('/setup/scm/github')
        .send(scmConfig);

      expect(res.status).toBe(200);
      expect(service.saveSCMConfig).toHaveBeenCalledWith('github', scmConfig);
    });

    it('saves SCM config for gitlab', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app)
        .post('/setup/scm/gitlab')
        .send(scmConfig);

      expect(res.status).toBe(200);
      expect(service.saveSCMConfig).toHaveBeenCalledWith('gitlab', scmConfig);
    });
  });

  describe('DELETE /setup/scm/:provider', () => {
    it('deletes SCM config', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app).delete('/setup/scm/github');

      expect(res.status).toBe(200);
      expect(service.deleteSCMConfig).toHaveBeenCalledWith('github');
    });
  });

  describe('POST /setup/apply', () => {
    it('applies setup and returns result', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app).post('/setup/apply');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { restartTriggered: false, deploymentMode: 'local' },
      });
      expect(service.applySetup).toHaveBeenCalled();
    });
  });

  describe('POST /setup/batch', () => {
    it('runs batch setup', async () => {
      const batchPayload = {
        aap: {
          controllerUrl: 'https://aap.example.com',
          adminToken: 'token',
          clientId: 'cid',
          clientSecret: 'csecret',
        },
        apply: true,
      };
      const { app, service } = await createTestApp();

      const res = await request(app).post('/setup/batch').send(batchPayload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { applied: true } });
      expect(service.batchSetup).toHaveBeenCalledWith(batchPayload);
    });

    it('reports applied=false when apply is not set', async () => {
      const { app } = await createTestApp();

      const res = await request(app)
        .post('/setup/batch')
        .send({ aap: {} });

      expect(res.body.data.applied).toBe(false);
    });
  });

  // ---- Admin APIs (post-setup) ----

  describe('GET /connections', () => {
    it('returns connections when authorized', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app).get('/connections');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.aap.controllerUrl).toBe('https://aap.example.com');
      expect(res.body.data.scm.github.configured).toBe(true);
      expect(res.body.data.scm.gitlab.configured).toBe(false);
      expect(service.getConnections).toHaveBeenCalled();
    });

    it('returns 403 when unauthorized', async () => {
      const { app } = await createTestApp({
        permissions: createMockPermissions(AuthorizeResult.DENY),
      });

      const res = await request(app).get('/connections');

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /connections/aap', () => {
    it('updates AAP with allowPartialSecrets', async () => {
      const { app, service } = await createTestApp();
      const partialUpdate = {
        controllerUrl: 'https://aap-new.example.com',
        clientId: 'new-client',
      };

      const res = await request(app)
        .put('/connections/aap')
        .send(partialUpdate);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { restartRequired: true },
      });
      expect(service.saveAAPConfig).toHaveBeenCalledWith(partialUpdate, {
        allowPartialSecrets: true,
      });
    });
  });

  describe('PUT /connections/registries', () => {
    it('updates registries config', async () => {
      const { app, service } = await createTestApp();
      const update = { pahEnabled: false, certifiedContent: true };

      const res = await request(app)
        .put('/connections/registries')
        .send(update);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(service.saveRegistriesConfig).toHaveBeenCalledWith(update);
    });
  });

  describe('PUT /connections/scm/:provider', () => {
    it('updates SCM with allowPartialSecrets', async () => {
      const { app, service } = await createTestApp();
      const update = { providerUrl: 'https://github.example.com' };

      const res = await request(app)
        .put('/connections/scm/github')
        .send(update);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { restartRequired: true },
      });
      expect(service.saveSCMConfig).toHaveBeenCalledWith('github', update, {
        allowPartialSecrets: true,
      });
    });
  });

  describe('DELETE /connections/scm/:provider', () => {
    it('deletes SCM connection', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app).delete('/connections/scm/gitlab');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { restartRequired: true },
      });
      expect(service.deleteSCMConfig).toHaveBeenCalledWith('gitlab');
    });
  });

  describe('PUT /general/local-admin', () => {
    it('enables local admin', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app)
        .put('/general/local-admin')
        .send({ enabled: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(service.setLocalAdmin).toHaveBeenCalledWith(true);
    });

    it('disables local admin', async () => {
      const { app, service } = await createTestApp();

      const res = await request(app)
        .put('/general/local-admin')
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(service.setLocalAdmin).toHaveBeenCalledWith(false);
    });

    it('returns 400 for non-boolean enabled', async () => {
      const { app } = await createTestApp();

      const res = await request(app)
        .put('/general/local-admin')
        .send({ enabled: 'yes' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('"enabled" must be a boolean');
    });

    it('returns 400 for missing enabled', async () => {
      const { app } = await createTestApp();

      const res = await request(app).put('/general/local-admin').send({});

      expect(res.status).toBe(400);
    });
  });

  // ---- Sync ----

  describe('POST /connections/:type/sync', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ synced: true }),
      } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('proxies AAP sync to catalog', async () => {
      const { app } = await createTestApp();

      const res = await request(app).post('/connections/aap/sync');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { synced: true } });
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/aap/sync_orgs_users_teams',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('proxies PAH sync with filters', async () => {
      const { app } = await createTestApp();

      const res = await request(app).post('/connections/pah/sync');

      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/ansible/sync/from-aap/content',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            filters: [
              { repository_name: 'rh-certified' },
              { repository_name: 'validated' },
              { repository_name: 'published' },
            ],
          }),
        }),
      );
    });

    it('proxies GitHub sync with SCM filter', async () => {
      const { app } = await createTestApp();

      const res = await request(app).post('/connections/github/sync');

      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/ansible/sync/from-scm/content',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ filters: [{ scmProvider: 'github' }] }),
        }),
      );
    });

    it('proxies GitLab sync with SCM filter', async () => {
      const { app } = await createTestApp();

      const res = await request(app).post('/connections/gitlab/sync');

      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:7007/api/catalog/ansible/sync/from-scm/content',
        expect.objectContaining({
          body: JSON.stringify({ filters: [{ scmProvider: 'gitlab' }] }),
        }),
      );
    });

    it('returns 400 for unknown sync type', async () => {
      const { app } = await createTestApp();

      const res = await request(app).post('/connections/unknown/sync');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unknown sync type');
    });

    it('forwards error status from catalog', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ error: 'upstream failed' }),
      } as Response);
      const { app } = await createTestApp();

      const res = await request(app).post('/connections/aap/sync');

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
    });

    it('includes service-to-service auth token', async () => {
      const { app } = await createTestApp();

      await request(app).post('/connections/aap/sync');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-service-token',
          }),
        }),
      );
    });
  });

  // ---- Authorization ----

  describe('authorization', () => {
    const writeEndpoints = [
      ['POST', '/setup/aap', {}],
      ['POST', '/setup/registries', {}],
      ['POST', '/setup/scm/github', {}],
      ['DELETE', '/setup/scm/github', undefined],
      ['POST', '/setup/apply', undefined],
      ['POST', '/setup/batch', {}],
      ['PUT', '/connections/aap', {}],
      ['PUT', '/connections/registries', {}],
      ['PUT', '/connections/scm/github', {}],
      ['DELETE', '/connections/scm/github', undefined],
      ['PUT', '/general/local-admin', { enabled: true }],
    ] as const;

    it.each(writeEndpoints)(
      '%s %s returns 403 when denied',
      async (method, path, body) => {
        const { app } = await createTestApp({
          permissions: createMockPermissions(AuthorizeResult.DENY),
        });

        const req = (request(app) as any)[method.toLowerCase()](path);
        if (body !== undefined) {
          req.send(body);
        }
        const res = await req;

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      },
    );
  });

  // ---- Error handling ----

  describe('error handling', () => {
    it('returns 500 for unexpected errors', async () => {
      const service = createMockService({
        getSetupStatus: jest.fn().mockRejectedValue(new Error('DB crash')),
      } as any);
      const { app } = await createTestApp({ service });

      const res = await request(app).get('/setup/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        success: false,
        error: 'Internal server error',
      });
    });
  });
});
