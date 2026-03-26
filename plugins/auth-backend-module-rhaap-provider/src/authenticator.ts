import { createHash } from 'crypto';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import {
  createOAuthAuthenticator,
  PassportOAuthAuthenticatorHelper,
  PassportOAuthDoneCallback,
  PassportProfile,
} from '@backstage/plugin-auth-node';
import { IAAPService } from '@ansible/backstage-rhaap-common';

type ResolvedConfig = {
  host: string;
  clientId: string;
  clientSecret: string;
  checkSSL: boolean;
};

/** @public */
export interface AAPAuthenticatorContext {
  helper: PassportOAuthAuthenticatorHelper;
  host: string;
  clientId: string;
  clientSecret: string;
  callbackURL: string;
  checkSSL: boolean;
  /** Static config defaults — used as fallback when DB config not available */
  _staticConfig: ResolvedConfig;
  /** Cached helper + config hash for dynamic re-creation */
  _cachedConfigHash: string;
  /** Resolver function injected by module.ts for DB config reads */
  _configResolver?: () => Promise<ResolvedConfig | null>;
}

/**
 * Creates a helper (OAuth2Strategy) for the given config.
 */
function createHelperForConfig(
  config: ResolvedConfig,
  callbackURL: string,
): PassportOAuthAuthenticatorHelper {
  return PassportOAuthAuthenticatorHelper.from(
    new OAuth2Strategy(
      {
        clientID: config.clientId,
        clientSecret: config.clientSecret,
        callbackURL,
        authorizationURL: `${config.host}/o/authorize/`,
        tokenURL: `${config.host}/o/token/`,
        skipUserProfile: true,
        passReqToCallback: false,
      },
      (
        accessToken: any,
        refreshToken: any,
        params: any,
        fullProfile: PassportProfile,
        done: PassportOAuthDoneCallback,
      ) => {
        done(
          undefined,
          { fullProfile, params, accessToken },
          { refreshToken },
        );
      },
    ),
  );
}

function configHash(config: ResolvedConfig): string {
  return createHash('sha256')
    .update(`${config.host}|${config.clientId}|${config.clientSecret}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Resolves the latest AAP config — checks DB override first, falls back to static.
 * Recreates the OAuth2Strategy helper only if the config has changed.
 */
async function resolveConfigAndHelper(
  ctx: AAPAuthenticatorContext,
): Promise<{
  host: string;
  clientId: string;
  clientSecret: string;
  checkSSL: boolean;
  helper: PassportOAuthAuthenticatorHelper;
}> {
  // Fallback for contexts without _staticConfig (e.g., manually constructed in tests)
  let resolved: ResolvedConfig = ctx._staticConfig ?? {
    host: ctx.host,
    clientId: ctx.clientId,
    clientSecret: ctx.clientSecret,
    checkSSL: ctx.checkSSL,
  };

  // Try DB config override (if resolver is available)
  if (ctx._configResolver) {
    try {
      const dbConfig = await ctx._configResolver();
      if (dbConfig) {
        resolved = dbConfig;
      }
    } catch {
      // DB not available — use static config
    }
  }

  // Recreate helper only if config changed
  const hash = configHash(resolved);
  if (hash !== ctx._cachedConfigHash) {
    ctx.helper = createHelperForConfig(resolved, ctx.callbackURL);
    ctx.host = resolved.host;
    ctx.clientId = resolved.clientId;
    ctx.clientSecret = resolved.clientSecret;
    ctx.checkSSL = resolved.checkSSL;
    ctx._cachedConfigHash = hash;
  }

  return {
    host: ctx.host,
    clientId: ctx.clientId,
    clientSecret: ctx.clientSecret,
    checkSSL: ctx.checkSSL,
    helper: ctx.helper,
  };
}

/** @public */
export const aapAuthAuthenticator = (aapService: IAAPService) =>
  createOAuthAuthenticator<AAPAuthenticatorContext, PassportProfile>({
    scopes: {
      persist: true,
    },
    defaultProfileTransform:
      PassportOAuthAuthenticatorHelper.defaultProfileTransform,
    initialize({ callbackUrl, config }) {
      const clientId = config.getString('clientId');
      const clientSecret = config.getString('clientSecret');
      let host = config.getString('host');
      host = host.slice(-1) === '/' ? host.slice(0, -1) : host;
      const callbackURL =
        config.getOptionalString('callbackUrl') ?? callbackUrl;
      const checkSSL = config.getBoolean('checkSSL') ?? true;

      const staticConfig: ResolvedConfig = {
        host,
        clientId,
        clientSecret,
        checkSSL,
      };

      const helper = createHelperForConfig(staticConfig, callbackURL);

      return {
        helper,
        host,
        clientId,
        clientSecret,
        callbackURL,
        checkSSL,
        _staticConfig: staticConfig,
        _cachedConfigHash: configHash(staticConfig),
        // _configResolver is injected later by module.ts if DB is available
      };
    },

    async start(input, ctx) {
      // Resolve latest config (may recreate helper if config changed)
      const { helper } = await resolveConfigAndHelper(ctx);
      const start = await helper.start(input, {
        accessType: 'offline',
        prompt: 'auto',
        approval_prompt: 'auto',
      });
      start.url += '&approval_prompt=auto';
      return start;
    },

    async authenticate(input, ctx) {
      const { host, clientId, clientSecret, checkSSL } =
        await resolveConfigAndHelper(ctx);

      const result = await aapService.rhAAPAuthenticate({
        host,
        checkSSL,
        clientId,
        clientSecret,
        callbackURL: ctx.callbackURL,
        code: input.req.query.code as string,
      });
      const fullProfile = await aapService.fetchProfile(
        result.session.accessToken,
      );
      return { ...result, fullProfile };
    },

    async refresh(input, ctx) {
      const { host, clientId, clientSecret, checkSSL } =
        await resolveConfigAndHelper(ctx);

      const result = await aapService.rhAAPAuthenticate({
        host,
        checkSSL,
        clientId,
        clientSecret,
        callbackURL: ctx.callbackURL,
        refreshToken: input.refreshToken,
      });

      const fullProfile = await aapService.fetchProfile(
        result.session.accessToken,
      );
      return { ...result, fullProfile };
    },
  });
