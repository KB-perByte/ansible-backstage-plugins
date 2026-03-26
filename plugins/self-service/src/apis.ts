import {
  ApiFactory,
  createApiFactory,
  DiscoveryApi,
  FetchApi,
  OAuthRequestApi,
  configApiRef,
  discoveryApiRef,
  oauthRequestApiRef,
  createApiRef,
  type ApiRef,
  type BackstageIdentityApi,
  type OAuthApi,
  type OpenIdConnectApi,
  type ProfileInfoApi,
  type SessionApi,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { OAuth2 } from '@backstage/core-app-api';
import { Config } from '@backstage/config';

type CustomAuthApiRefType = OAuthApi &
  OpenIdConnectApi &
  ProfileInfoApi &
  BackstageIdentityApi &
  SessionApi;

export interface AnsibleApi {
  syncTemplates(): Promise<boolean>;
  syncOrgsUsersTeam(): Promise<boolean>;
  getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: { lastSync: string | null };
      jobTemplates: { lastSync: string | null };
    };
  }>;
}

export const ansibleApiRef = createApiRef<AnsibleApi>({
  id: 'ansible',
});

export const rhAapAuthApiRef: ApiRef<CustomAuthApiRefType> = createApiRef({
  id: 'ansible.auth.rhaap',
});

type AAPAuthApiFactoryType = ApiFactory<
  CustomAuthApiRefType,
  OAuth2,
  {
    discoveryApi: DiscoveryApi;
    oauthRequestApi: OAuthRequestApi;
    configApi: Config;
  }
>;

export class AnsibleApiClient implements AnsibleApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async syncTemplates(): Promise<boolean> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/aap/sync_job_templates`,
      );
      const data = await response.json();
      return data;
    } catch {
      return false;
    }
  }

  async syncOrgsUsersTeam(): Promise<boolean> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/aap/sync_orgs_users_teams`,
      );
      const data = await response.json();
      return data;
    } catch {
      return false;
    }
  }

  async getSyncStatus(): Promise<{
    aap: {
      orgsUsersTeams: { lastSync: string | null };
      jobTemplates: { lastSync: string | null };
    };
  }> {
    const baseUrl = await this.discoveryApi.getBaseUrl('catalog');
    try {
      const response = await this.fetchApi.fetch(
        `${baseUrl}/ansible/sync/status?aap_entities=true`,
      );
      const data = await response.json();
      return data;
    } catch {
      return {
        aap: {
          orgsUsersTeams: { lastSync: null },
          jobTemplates: { lastSync: null },
        },
      };
    }
  }
}

export const AAPApis: ApiFactory<
  AnsibleApi,
  AnsibleApiClient,
  { discoveryApi: DiscoveryApi; fetchApi: FetchApi }
> = createApiFactory({
  api: ansibleApiRef,
  deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discoveryApi, fetchApi }) =>
    new AnsibleApiClient({ discoveryApi, fetchApi }),
});

// --- Portal Admin API ---

import type {
  SetupStatus,
  AAPConfig,
  RegistriesConfig,
  SCMConfig,
  BatchSetupConfig,
  ConnectionsResponse,
} from '@ansible/backstage-rhaap-common';

export interface PortalAdminApi {
  getSetupStatus(): Promise<SetupStatus>;
  saveAAPConfig(config: AAPConfig): Promise<void>;
  saveRegistriesConfig(config: RegistriesConfig): Promise<void>;
  saveSCMConfig(provider: string, config: SCMConfig): Promise<void>;
  deleteSCMConfig(provider: string): Promise<void>;
  applySetup(): Promise<{ restartTriggered: boolean; deploymentMode: string }>;
  batchSetup(config: BatchSetupConfig): Promise<void>;
  getConnections(): Promise<ConnectionsResponse>;
  updateAAPConnection(config: AAPConfig): Promise<void>;
  updateRegistries(config: RegistriesConfig): Promise<void>;
  updateSCMConnection(provider: string, config: SCMConfig): Promise<void>;
  deleteSCMConnection(provider: string): Promise<void>;
  setLocalAdmin(enabled: boolean): Promise<void>;
  triggerSync(type: string): Promise<void>;
}

export const portalAdminApiRef = createApiRef<PortalAdminApi>({
  id: 'portal-admin',
});

export class PortalAdminClient implements PortalAdminApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('rhaap-backend');
  }

  private async request(
    path: string,
    options?: RequestInit,
  ): Promise<any> {
    const url = `${await this.baseUrl()}${path}`;
    const response = await this.fetchApi.fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error ?? `Request failed: ${response.status}`);
    }
    return json;
  }

  async getSetupStatus(): Promise<SetupStatus> {
    const res = await this.request('/setup/status');
    return res.data;
  }

  async saveAAPConfig(config: AAPConfig): Promise<void> {
    await this.request('/setup/aap', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async saveRegistriesConfig(config: RegistriesConfig): Promise<void> {
    await this.request('/setup/registries', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async saveSCMConfig(provider: string, config: SCMConfig): Promise<void> {
    await this.request(`/setup/scm/${provider}`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async deleteSCMConfig(provider: string): Promise<void> {
    await this.request(`/setup/scm/${provider}`, { method: 'DELETE' });
  }

  async applySetup(): Promise<{
    restartTriggered: boolean;
    deploymentMode: string;
  }> {
    const res = await this.request('/setup/apply', { method: 'POST' });
    return res.data;
  }

  async batchSetup(config: BatchSetupConfig): Promise<void> {
    await this.request('/setup/batch', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async getConnections(): Promise<ConnectionsResponse> {
    const res = await this.request('/connections');
    return res.data;
  }

  async updateAAPConnection(config: AAPConfig): Promise<void> {
    await this.request('/connections/aap', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async updateRegistries(config: RegistriesConfig): Promise<void> {
    await this.request('/connections/registries', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async updateSCMConnection(
    provider: string,
    config: SCMConfig,
  ): Promise<void> {
    await this.request(`/connections/scm/${provider}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async deleteSCMConnection(provider: string): Promise<void> {
    await this.request(`/connections/scm/${provider}`, { method: 'DELETE' });
  }

  async setLocalAdmin(enabled: boolean): Promise<void> {
    await this.request('/general/local-admin', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  }

  async triggerSync(type: string): Promise<void> {
    await this.request(`/connections/${type}/sync`, { method: 'POST' });
  }
}

export const PortalAdminApis = createApiFactory({
  api: portalAdminApiRef,
  deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
  factory: ({ discoveryApi, fetchApi }) =>
    new PortalAdminClient({ discoveryApi, fetchApi }),
});

export const AapAuthApi: AAPAuthApiFactoryType = createApiFactory({
  api: rhAapAuthApiRef,
  deps: {
    discoveryApi: discoveryApiRef,
    oauthRequestApi: oauthRequestApiRef,
    configApi: configApiRef,
  },
  factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
    OAuth2.create({
      configApi,
      discoveryApi,
      oauthRequestApi,
      provider: {
        id: 'rhaap',
        title: 'RH AAP',
        icon: () => null,
      },
      environment: configApi.getOptionalString('auth.environment'),
      defaultScopes: ['read', 'write'],
    }),
});
