import {
  createBackendModule,
  coreServices,
} from '@backstage/backend-plugin-api';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
  createProxyAuthProviderFactory,
} from '@backstage/plugin-auth-node';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { AAPAuthSignInResolvers } from './resolvers';
import { ansibleServiceRef } from '@ansible/backstage-rhaap-common';
import { aapAuthAuthenticator } from './authenticator';
import { localAdminAuthenticator } from './localAdminAuthenticator';

export const authModuleRhaapProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'rhaap-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        providers: authProvidersExtensionPoint,
        ansibleService: ansibleServiceRef,
        config: coreServices.rootConfig,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        logger: coreServices.logger,
      },
      async init({
        providers,
        ansibleService,
        discovery,
        auth,
        config,
        logger,
      }) {
        // Register AAP OAuth provider (primary auth for normal use)
        providers.registerProvider({
          providerId: 'rhaap',
          factory: createOAuthProviderFactory({
            authenticator: aapAuthAuthenticator(ansibleService),
            signInResolverFactories: {
              usernameMatchingUser:
                AAPAuthSignInResolvers.usernameMatchingUser,
              allowNewAAPUserSignIn:
                AAPAuthSignInResolvers.allowNewAAPUserSignIn({
                  discovery,
                  auth,
                }),
            },
          }),
        });

        // Register local admin provider (for setup wizard and emergency recovery)
        // Uses ProxyAuthenticator pattern so Backstage's TokenFactory issues
        // a proper user JWT that the frontend IdentityApi accepts.
        const adminConfig = config.getOptionalConfig(
          'auth.providers.local-admin',
        );
        if (
          adminConfig ||
          config.getOptionalString('ansible.portal.admin.password') ||
          process.env.PORTAL_ADMIN_PASSWORD_HASH
        ) {
          providers.registerProvider({
            providerId: 'local-admin',
            factory: createProxyAuthProviderFactory({
              authenticator: localAdminAuthenticator,
              signInResolver: async (_info, ctx) => {
                const userRef = stringifyEntityRef({
                  kind: 'user',
                  namespace: 'default',
                  name: 'admin',
                });
                try {
                  return await ctx.signInWithCatalogUser({
                    entityRef: userRef,
                  });
                } catch {
                  // User not in catalog — issue token directly
                  return ctx.issueToken({
                    claims: {
                      sub: userRef,
                      ent: [userRef],
                    },
                  });
                }
              },
            }),
          });
          logger.info(
            'Local admin auth provider registered for setup/recovery',
          );
        }

        logger.info('RHAAP auth provider registered');
      },
    });
  },
});
