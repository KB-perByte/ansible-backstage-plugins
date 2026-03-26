export type DeploymentMode = 'openshift' | 'rhel' | 'local';

export type SetupStatus = {
  onboardingEnabled: boolean;
  setupComplete: boolean;
  localAdminEnabled: boolean;
  deploymentMode: DeploymentMode;
};

export type AAPConfig = {
  controllerUrl: string;
  adminToken: string;
  clientId: string;
  clientSecret: string;
  checkSSL?: boolean;
};

export type RegistriesConfig = {
  pahEnabled: boolean;
  pahInheritAap: boolean;
  pahUrl?: string;
  pahToken?: string;
  certifiedContent: boolean;
  validatedContent: boolean;
  galaxyEnabled: boolean;
};

export type SCMConfig = {
  providerUrl: string;
  token: string;
  targetOrgs?: string;
  eeFilename?: string;
  branches?: string;
  maxDepth?: number;
  oauthClientId?: string;
  oauthClientSecret?: string;
};

export type BatchSetupConfig = {
  aap: AAPConfig;
  registries?: RegistriesConfig;
  scm?: Record<string, SCMConfig>;
  apply?: boolean;
};

export type ConnectionStatus = {
  configured: boolean;
  contentDiscovery?: 'active' | 'inactive';
  sso?: 'active' | 'inactive';
};

export type AAPConnectionInfo = {
  controllerUrl: string;
  hasAdminToken: boolean;
  clientId: string;
  hasClientSecret: boolean;
  checkSSL: boolean;
  status: ConnectionStatus;
};

export type RegistriesConnectionInfo = {
  pahEnabled: boolean;
  pahInheritAap: boolean;
  pahUrl?: string;
  hasPahToken: boolean;
  certifiedContent: boolean;
  validatedContent: boolean;
  galaxyEnabled: boolean;
};

export type SCMConnectionInfo = {
  configured: boolean;
  providerUrl?: string;
  hasToken: boolean;
  targetOrgs?: string;
  eeFilename?: string;
  branches?: string;
  maxDepth?: number;
  hasSsoConfigured: boolean;
  status: ConnectionStatus;
};

export type ConnectionsResponse = {
  aap: AAPConnectionInfo;
  registries: RegistriesConnectionInfo;
  scm: Record<string, SCMConnectionInfo>;
};

export type SCMProviderDescriptor = {
  id: string;
  name: string;
  defaultHost: string;
  configMapping: {
    integrationConfigPath: string;
    authProviderConfigPath: string;
    catalogProviderType: string;
  };
};

export type ConfigRow = {
  id?: number;
  config_key: string;
  config_value: string;
  is_secret: boolean;
  category: string;
  created_at?: string;
  updated_at?: string;
};
