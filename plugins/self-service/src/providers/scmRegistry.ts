export interface SCMProviderUI {
  id: string;
  name: string;
  defaultHost: string;
  description: string;
}

export const scmProviders: SCMProviderUI[] = [
  {
    id: 'github',
    name: 'GitHub',
    defaultHost: 'https://github.com',
    description: 'Enable SSO, Team Sync, Discovery, and Write Access.',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    defaultHost: 'https://gitlab.com',
    description: 'Enable SSO, Team Sync, Discovery, and Write Access.',
  },
  // Future: Add Bitbucket here
];
