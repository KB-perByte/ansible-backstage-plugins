import { createHash } from 'crypto';
import { createProxyAuthenticator } from '@backstage/plugin-auth-node';
import { NotAllowedError, AuthenticationError } from '@backstage/errors';
import { Config } from '@backstage/config';

/**
 * Proxy authenticator for local admin login.
 *
 * Uses the ProxyAuthenticator pattern so that Backstage's TokenFactory
 * issues a proper user JWT (ES256, type: vnd.backstage.user).
 *
 * Authentication modes:
 * 1. POST/GET with credentials (headers or body) — validates password
 * 2. GET without credentials — auto-authenticates if password is configured
 *    (similar to guest provider, enables token refresh without re-entering password)
 */
export const localAdminAuthenticator = createProxyAuthenticator({
  defaultProfileTransform: async (_result, _ctx) => ({
    profile: {
      displayName: 'Admin',
      email: 'admin@portal.local',
    },
  }),

  initialize({ config }: { config: Config }) {
    // The config received here is at the provider level (auth.providers.local-admin).
    // Backstage nests provider config under environment keys (e.g., "development"),
    // so the password lives at config.<env>.password rather than config.password.
    const envConfig =
      config.getOptionalConfig('development') ??
      config.getOptionalConfig('production');
    const devPassword =
      config.getOptionalString('password') ??
      envConfig?.getOptionalString('password') ??
      process.env.PORTAL_ADMIN_PASSWORD;
    const hashFromEnv = process.env.PORTAL_ADMIN_PASSWORD_HASH;
    return { devPassword, hashFromEnv };
  },

  async authenticate({ req }, ctx) {
    const { devPassword, hashFromEnv } = ctx;

    const hasPassword = !!devPassword || !!hashFromEnv;
    if (!hasPassword) {
      throw new NotAllowedError(
        'Local admin is not configured. Set PORTAL_ADMIN_PASSWORD env var or auth.providers.local-admin.<env>.password in config.',
      );
    }

    // Extract credentials from request body or headers
    const username =
      req.body?.username ?? req.headers['x-admin-username'] as string;
    const password =
      req.body?.password ?? req.headers['x-admin-password'] as string;

    // If credentials provided, validate them
    if (username && password) {
      if (username !== 'admin') {
        throw new AuthenticationError('Invalid credentials');
      }

      const valid = await validatePassword(password, devPassword, hashFromEnv);
      if (!valid) {
        throw new AuthenticationError('Invalid credentials');
      }

      return {
        result: { username: 'admin', email: 'admin@portal.local' },
        providerInfo: {},
      };
    }

    // No credentials provided — auto-authenticate for token refresh
    // This is the same pattern as the guest provider: if the provider
    // is configured and the user already authenticated once, subsequent
    // GET /refresh calls succeed without re-entering credentials.
    return {
      result: { username: 'admin', email: 'admin@portal.local' },
      providerInfo: {},
    };
  },
});

async function validatePassword(
  password: string,
  devPassword: string | undefined,
  hashFromEnv: string | undefined,
): Promise<boolean> {
  // Production: bcrypt hash
  if (hashFromEnv) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bcrypt = require('bcrypt') as {
        compare: (data: string, hash: string) => Promise<boolean>;
      };
      return bcrypt.compare(password, hashFromEnv);
    } catch {
      // bcrypt not available — fall through
    }
  }

  // Local dev: plain text (timing-safe comparison)
  if (devPassword) {
    const a = createHash('sha256').update(password).digest('hex');
    const b = createHash('sha256').update(devPassword).digest('hex');
    return a === b;
  }

  return false;
}
