import { ConfigRow, SCMProviderDescriptor } from '@ansible/backstage-rhaap-common';

/**
 * SCM provider descriptors defining how DB config keys map to Backstage config paths.
 */
const SCM_DESCRIPTORS: Record<string, SCMProviderDescriptor> = {
  github: {
    id: 'github',
    name: 'GitHub',
    defaultHost: 'github.com',
    configMapping: {
      integrationConfigPath: 'integrations.github',
      authProviderConfigPath: 'auth.providers.github',
      catalogProviderType: 'github',
    },
  },
  gitlab: {
    id: 'gitlab',
    name: 'GitLab',
    defaultHost: 'gitlab.com',
    configMapping: {
      integrationConfigPath: 'integrations.gitlab',
      authProviderConfigPath: 'auth.providers.gitlab',
      catalogProviderType: 'gitlab',
    },
  },
};

/**
 * Builds a nested Backstage config object from flat portal_config rows.
 *
 * Transforms DB entries like:
 *   { key: 'aap.controller_url', value: 'https://aap.example.com', category: 'aap' }
 *   { key: 'scm.github.token', value: 'ghp_xxx', category: 'scm_github' }
 *
 * Into nested config that Backstage plugins expect:
 *   { ansible: { rhaap: { baseUrl: '...' } }, integrations: { github: [{ token: '...' }] } }
 */
export function buildConfigTree(
  rows: ConfigRow[],
  authEnvironment: string = 'production',
): Record<string, any> | null {
  if (rows.length === 0) return null;

  const config: Record<string, any> = {};
  const rowsByCategory = groupByCategory(rows);

  // Process AAP config
  const aapRows = rowsByCategory.aap;
  if (aapRows) {
    const aapMap = toMap(aapRows);
    const controllerUrl = aapMap['aap.controller_url'];
    const checkSSL = aapMap['aap.check_ssl'] !== 'false';

    if (controllerUrl) {
      setNested(config, 'ansible.rhaap.baseUrl', controllerUrl);
      setNested(config, 'ansible.rhaap.checkSSL', checkSSL);
    }
    if (aapMap['aap.admin_token']) {
      setNested(config, 'ansible.rhaap.token', aapMap['aap.admin_token']);
    }

    // Auth provider config for RHAAP
    const authPath = `auth.providers.rhaap.${authEnvironment}`;
    if (controllerUrl) {
      setNested(config, `${authPath}.host`, controllerUrl);
      setNested(config, `${authPath}.checkSSL`, checkSSL);
    }
    if (aapMap['aap.oauth_client_id']) {
      setNested(config, `${authPath}.clientId`, aapMap['aap.oauth_client_id']);
    }
    if (aapMap['aap.oauth_client_secret']) {
      setNested(
        config,
        `${authPath}.clientSecret`,
        aapMap['aap.oauth_client_secret'],
      );
    }
    // Default sign-in resolver
    setNested(config, `${authPath}.signIn.resolvers`, [
      { resolver: 'allowNewAAPUserSignIn' },
    ]);
  }

  // Process SCM providers
  for (const [providerKey, descriptor] of Object.entries(SCM_DESCRIPTORS)) {
    const scmRows = rowsByCategory[`scm_${providerKey}`];
    if (!scmRows) continue;

    const scmMap = toMap(scmRows);
    const prefix = `scm.${providerKey}`;
    const providerUrl = scmMap[`${prefix}.provider_url`];

    if (!providerUrl) continue;

    // Parse host from URL
    let host: string;
    try {
      host = new URL(providerUrl).hostname;
    } catch {
      host = providerUrl;
    }

    // integrations.<provider>[0]
    const integration: Record<string, any> = { host };
    if (scmMap[`${prefix}.token`]) {
      integration.token = scmMap[`${prefix}.token`];
    }
    if (scmMap[`${prefix}.api_base_url`]) {
      integration.apiBaseUrl = scmMap[`${prefix}.api_base_url`];
    }
    setNested(config, descriptor.configMapping.integrationConfigPath, [
      integration,
    ]);

    // auth.providers.<provider>.<env> (if OAuth configured)
    if (scmMap[`${prefix}.oauth_client_id`]) {
      const authPath = `${descriptor.configMapping.authProviderConfigPath}.${authEnvironment}`;
      setNested(
        config,
        `${authPath}.clientId`,
        scmMap[`${prefix}.oauth_client_id`],
      );
      if (scmMap[`${prefix}.oauth_client_secret`]) {
        setNested(
          config,
          `${authPath}.clientSecret`,
          scmMap[`${prefix}.oauth_client_secret`],
        );
      }
      setNested(config, `${authPath}.signIn.resolvers`, [
        { resolver: 'usernameMatchingUserEntityName' },
      ]);
    }
  }

  return Object.keys(config).length > 0 ? config : null;
}

// --- Helpers ---

function groupByCategory(
  rows: ConfigRow[],
): Record<string, ConfigRow[]> {
  const groups: Record<string, ConfigRow[]> = {};
  for (const row of rows) {
    if (!groups[row.category]) {
      groups[row.category] = [];
    }
    groups[row.category].push(row);
  }
  return groups;
}

function toMap(rows: ConfigRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.config_key] = row.config_value;
  }
  return map;
}

/**
 * Sets a deeply nested value in an object using dot-notation path.
 * Example: setNested(obj, 'a.b.c', 'value') → obj.a.b.c = 'value'
 */
function setNested(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
