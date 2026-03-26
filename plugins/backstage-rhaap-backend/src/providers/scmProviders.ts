import { SCMProviderDescriptor } from '@ansible/backstage-rhaap-common';

/**
 * Registry of supported SCM providers.
 *
 * To add a new provider (e.g., Bitbucket):
 * 1. Add a new descriptor here
 * 2. Add the provider ID to VALID_SCM_PROVIDERS in constants.ts
 * 3. The API, database, and config tree builder handle it automatically
 */
export const scmProviderDescriptors: SCMProviderDescriptor[] = [
  {
    id: 'github',
    name: 'GitHub',
    defaultHost: 'github.com',
    configMapping: {
      integrationConfigPath: 'integrations.github',
      authProviderConfigPath: 'auth.providers.github',
      catalogProviderType: 'github',
    },
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    defaultHost: 'gitlab.com',
    configMapping: {
      integrationConfigPath: 'integrations.gitlab',
      authProviderConfigPath: 'auth.providers.gitlab',
      catalogProviderType: 'gitlab',
    },
  },
];
