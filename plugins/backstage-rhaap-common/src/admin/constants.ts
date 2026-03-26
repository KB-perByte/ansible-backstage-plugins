/**
 * Database config key names used in the portal_config table.
 * These keys are transformed by configTreeBuilder into nested Backstage config.
 */
export const CONFIG_KEYS = {
  // AAP
  AAP_CONTROLLER_URL: 'aap.controller_url',
  AAP_ADMIN_TOKEN: 'aap.admin_token',
  AAP_OAUTH_CLIENT_ID: 'aap.oauth_client_id',
  AAP_OAUTH_CLIENT_SECRET: 'aap.oauth_client_secret',
  AAP_CHECK_SSL: 'aap.check_ssl',

  // Registries
  REGISTRIES_PAH_ENABLED: 'registries.pah_enabled',
  REGISTRIES_PAH_INHERIT_AAP: 'registries.pah_inherit_aap',
  REGISTRIES_PAH_URL: 'registries.pah_url',
  REGISTRIES_PAH_TOKEN: 'registries.pah_token',
  REGISTRIES_CERTIFIED_CONTENT: 'registries.certified_content',
  REGISTRIES_VALIDATED_CONTENT: 'registries.validated_content',
  REGISTRIES_GALAXY_ENABLED: 'registries.galaxy_enabled',
} as const;

/**
 * Returns the config keys for a given SCM provider.
 * Follows the pattern: `scm.<provider>.<field>`
 */
export function scmConfigKeys(provider: string) {
  return {
    PROVIDER_URL: `scm.${provider}.provider_url`,
    API_BASE_URL: `scm.${provider}.api_base_url`,
    TOKEN: `scm.${provider}.token`,
    TARGET_ORGS: `scm.${provider}.target_orgs`,
    EE_FILENAME: `scm.${provider}.ee_filename`,
    BRANCHES: `scm.${provider}.branches`,
    MAX_DEPTH: `scm.${provider}.max_depth`,
    OAUTH_CLIENT_ID: `scm.${provider}.oauth_client_id`,
    OAUTH_CLIENT_SECRET: `scm.${provider}.oauth_client_secret`,
  } as const;
}

/**
 * Database category names used in the portal_config table.
 */
export const CATEGORIES = {
  AAP: 'aap',
  REGISTRIES: 'registries',
  scm: (provider: string) => `scm_${provider}`,
} as const;

/**
 * Supported SCM provider IDs.
 */
export const SCM_PROVIDERS = {
  GITHUB: 'github',
  GITLAB: 'gitlab',
} as const;

/**
 * Valid SCM provider IDs for validation.
 */
export const VALID_SCM_PROVIDERS = [
  SCM_PROVIDERS.GITHUB,
  SCM_PROVIDERS.GITLAB,
] as const;

/**
 * Config keys that contain secret values and must be encrypted at rest.
 */
export const SECRET_CONFIG_KEYS: Set<string> = new Set([
  CONFIG_KEYS.AAP_ADMIN_TOKEN,
  CONFIG_KEYS.AAP_OAUTH_CLIENT_SECRET,
  CONFIG_KEYS.REGISTRIES_PAH_TOKEN,
  // SCM secret keys are dynamic — checked via pattern match in encryption logic
]);

/**
 * Checks if a config key holds a secret value.
 */
export function isSecretKey(key: string): boolean {
  if (SECRET_CONFIG_KEYS.has(key)) return true;
  // SCM tokens and OAuth secrets are always secret
  return key.endsWith('.token') || key.endsWith('.oauth_client_secret');
}

/**
 * Plugin ID for the rhaap-backend plugin.
 */
export const RHAAP_BACKEND_PLUGIN_ID = 'rhaap-backend';
