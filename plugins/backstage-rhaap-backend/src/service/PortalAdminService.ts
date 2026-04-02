import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  SetupStatus,
  AAPConfig,
  RegistriesConfig,
  SCMConfig,
  BatchSetupConfig,
  ConnectionsResponse,
  CATEGORIES,
  CONFIG_KEYS,
  scmConfigKeys,
  isSecretKey,
  VALID_SCM_PROVIDERS,
} from '@ansible/backstage-rhaap-common';
import { DatabaseHandler } from '../database/DatabaseHandler';
import { RestartService } from './RestartService';
import { encrypt } from '../config/encryption';
import { InputError } from '@backstage/errors';

export class PortalAdminService {
  private readonly config: Config;
  private readonly logger: LoggerService;
  private readonly dbHandler: DatabaseHandler;
  private readonly restartService: RestartService;
  private readonly backendSecret: string;

  constructor(options: {
    config: Config;
    logger: LoggerService;
    dbHandler: DatabaseHandler;
    restartService: RestartService;
  }) {
    this.config = options.config;
    this.logger = options.logger;
    this.dbHandler = options.dbHandler;
    this.restartService = options.restartService;
    this.backendSecret = process.env.BACKEND_SECRET ?? 'development-secret';
  }

  async getSetupStatus(): Promise<SetupStatus> {
    const state = await this.dbHandler.getSetupState();
    const onboardingEnabled =
      this.config.getOptionalBoolean('ansible.portal.onboarding.enabled') ??
      false;

    return {
      onboardingEnabled,
      setupComplete: state.setup_complete,
      localAdminEnabled: state.local_admin_enabled,
      deploymentMode: this.restartService.detectDeploymentMode(),
    };
  }

  async saveAAPConfig(
    input: AAPConfig,
    options?: { allowPartialSecrets?: boolean },
  ): Promise<void> {
    this.validateUrl(input.controllerUrl, 'controllerUrl');
    this.validateNonEmpty(input.clientId, 'clientId');

    // During initial setup, secrets are required.
    // During edit (allowPartialSecrets), empty secrets mean "keep current value".
    if (!options?.allowPartialSecrets) {
      this.validateNonEmpty(input.adminToken, 'adminToken');
      this.validateNonEmpty(input.clientSecret, 'clientSecret');
    }

    const checkSSL = input.checkSSL ?? false;
    const category = CATEGORIES.AAP;

    await this.upsertConfigValue(
      CONFIG_KEYS.AAP_CONTROLLER_URL,
      input.controllerUrl,
      category,
    );
    if (input.adminToken) {
      await this.upsertConfigValue(
        CONFIG_KEYS.AAP_ADMIN_TOKEN,
        input.adminToken,
        category,
      );
    }
    await this.upsertConfigValue(
      CONFIG_KEYS.AAP_OAUTH_CLIENT_ID,
      input.clientId,
      category,
    );
    if (input.clientSecret) {
      await this.upsertConfigValue(
        CONFIG_KEYS.AAP_OAUTH_CLIENT_SECRET,
        input.clientSecret,
        category,
      );
    }
    await this.upsertConfigValue(
      CONFIG_KEYS.AAP_CHECK_SSL,
      String(checkSSL),
      category,
    );

    this.logger.info('AAP configuration saved');
  }

  async saveRegistriesConfig(input: RegistriesConfig): Promise<void> {
    const category = CATEGORIES.REGISTRIES;

    await this.upsertConfigValue(
      CONFIG_KEYS.REGISTRIES_PAH_ENABLED,
      String(input.pahEnabled),
      category,
    );
    await this.upsertConfigValue(
      CONFIG_KEYS.REGISTRIES_PAH_INHERIT_AAP,
      String(input.pahInheritAap),
      category,
    );

    if (input.pahEnabled && !input.pahInheritAap) {
      this.validateNonEmpty(input.pahUrl, 'pahUrl');
      this.validateNonEmpty(input.pahToken, 'pahToken');
      await this.upsertConfigValue(
        CONFIG_KEYS.REGISTRIES_PAH_URL,
        input.pahUrl!,
        category,
      );
      await this.upsertConfigValue(
        CONFIG_KEYS.REGISTRIES_PAH_TOKEN,
        input.pahToken!,
        category,
      );
    }

    await this.upsertConfigValue(
      CONFIG_KEYS.REGISTRIES_CERTIFIED_CONTENT,
      String(input.certifiedContent),
      category,
    );
    await this.upsertConfigValue(
      CONFIG_KEYS.REGISTRIES_VALIDATED_CONTENT,
      String(input.validatedContent),
      category,
    );
    await this.upsertConfigValue(
      CONFIG_KEYS.REGISTRIES_GALAXY_ENABLED,
      String(input.galaxyEnabled),
      category,
    );

    this.logger.info('Registries configuration saved');
  }

  async saveSCMConfig(
    provider: string,
    input: SCMConfig,
    options?: { allowPartialSecrets?: boolean },
  ): Promise<void> {
    this.validateSCMProvider(provider);
    this.validateUrl(input.providerUrl, 'providerUrl');

    if (!options?.allowPartialSecrets) {
      this.validateNonEmpty(input.token, 'token');
    }

    const category = CATEGORIES.scm(provider);
    const keys = scmConfigKeys(provider);

    await this.upsertConfigValue(keys.PROVIDER_URL, input.providerUrl, category);
    if (input.token) {
      await this.upsertConfigValue(keys.TOKEN, input.token, category);
    }

    if (input.targetOrgs) {
      await this.upsertConfigValue(keys.TARGET_ORGS, input.targetOrgs, category);
    }
    if (input.eeFilename) {
      await this.upsertConfigValue(keys.EE_FILENAME, input.eeFilename, category);
    }
    if (input.branches) {
      await this.upsertConfigValue(keys.BRANCHES, input.branches, category);
    }
    if (input.maxDepth !== undefined) {
      await this.upsertConfigValue(
        keys.MAX_DEPTH,
        String(input.maxDepth),
        category,
      );
    }
    if (input.oauthClientId) {
      await this.upsertConfigValue(
        keys.OAUTH_CLIENT_ID,
        input.oauthClientId,
        category,
      );
    }
    if (input.oauthClientSecret) {
      await this.upsertConfigValue(
        keys.OAUTH_CLIENT_SECRET,
        input.oauthClientSecret,
        category,
      );
    }

    this.logger.info(`SCM ${provider} configuration saved`);
  }

  async deleteSCMConfig(provider: string): Promise<void> {
    this.validateSCMProvider(provider);
    await this.dbHandler.deleteConfigByCategory(CATEGORIES.scm(provider));
    this.logger.info(`SCM ${provider} configuration deleted`);
  }

  async applySetup(): Promise<{
    restartTriggered: boolean;
    deploymentMode: string;
  }> {
    // Validate AAP config exists
    const hasAAP = await this.dbHandler.hasConfigInCategory(CATEGORIES.AAP);
    if (!hasAAP) {
      throw new InputError(
        'AAP configuration is required before applying setup',
      );
    }

    await this.dbHandler.setSetupComplete(true);
    await this.dbHandler.setLocalAdminEnabled(false);

    this.logger.info('Setup marked as complete');

    const { triggered, mode } = await this.restartService.triggerRestart();
    return { restartTriggered: triggered, deploymentMode: mode };
  }

  async batchSetup(input: BatchSetupConfig): Promise<void> {
    // Atomic: validate everything first, then save
    this.validateUrl(input.aap.controllerUrl, 'aap.controllerUrl');
    this.validateNonEmpty(input.aap.adminToken, 'aap.adminToken');
    this.validateNonEmpty(input.aap.clientId, 'aap.clientId');
    this.validateNonEmpty(input.aap.clientSecret, 'aap.clientSecret');

    if (input.scm) {
      for (const [provider, scmInput] of Object.entries(input.scm)) {
        this.validateSCMProvider(provider);
        this.validateUrl(scmInput.providerUrl, `scm.${provider}.providerUrl`);
        this.validateNonEmpty(scmInput.token, `scm.${provider}.token`);
      }
    }

    // Save all sections
    await this.saveAAPConfig(input.aap);
    if (input.registries) {
      await this.saveRegistriesConfig(input.registries);
    }
    if (input.scm) {
      for (const [provider, scmInput] of Object.entries(input.scm)) {
        await this.saveSCMConfig(provider, scmInput);
      }
    }

    if (input.apply) {
      await this.applySetup();
    }

    this.logger.info('Batch setup completed');
  }

  async getConnections(): Promise<ConnectionsResponse> {
    const aapRows = await this.dbHandler.getConfigByCategory(CATEGORIES.AAP);
    const registryRows = await this.dbHandler.getConfigByCategory(
      CATEGORIES.REGISTRIES,
    );

    const aapMap = this.rowsToMap(aapRows);
    const regMap = this.rowsToMap(registryRows);

    const scm: Record<string, any> = {};
    for (const provider of VALID_SCM_PROVIDERS) {
      const scmRows = await this.dbHandler.getConfigByCategory(
        CATEGORIES.scm(provider),
      );
      const scmMap = this.rowsToMap(scmRows);
      const keys = scmConfigKeys(provider);

      scm[provider] = {
        configured: scmRows.length > 0,
        providerUrl: scmMap[keys.PROVIDER_URL],
        hasToken: !!scmMap[keys.TOKEN],
        targetOrgs: scmMap[keys.TARGET_ORGS],
        eeFilename: scmMap[keys.EE_FILENAME],
        branches: scmMap[keys.BRANCHES],
        maxDepth: scmMap[keys.MAX_DEPTH]
          ? Number(scmMap[keys.MAX_DEPTH])
          : undefined,
        hasSsoConfigured: !!scmMap[keys.OAUTH_CLIENT_ID],
        status: {
          configured: scmRows.length > 0,
          contentDiscovery: scmRows.length > 0 ? 'active' : 'inactive',
          sso: scmMap[keys.OAUTH_CLIENT_ID] ? 'active' : 'inactive',
        },
      };
    }

    return {
      aap: {
        controllerUrl: aapMap[CONFIG_KEYS.AAP_CONTROLLER_URL] ?? '',
        hasAdminToken: !!aapMap[CONFIG_KEYS.AAP_ADMIN_TOKEN],
        clientId: aapMap[CONFIG_KEYS.AAP_OAUTH_CLIENT_ID] ?? '',
        hasClientSecret: !!aapMap[CONFIG_KEYS.AAP_OAUTH_CLIENT_SECRET],
        checkSSL: aapMap[CONFIG_KEYS.AAP_CHECK_SSL] !== 'false',
        status: {
          configured: aapRows.length > 0,
          contentDiscovery: aapRows.length > 0 ? 'active' : 'inactive',
          sso: aapMap[CONFIG_KEYS.AAP_OAUTH_CLIENT_ID] ? 'active' : 'inactive',
        },
      },
      registries: {
        pahEnabled: regMap[CONFIG_KEYS.REGISTRIES_PAH_ENABLED] !== 'false',
        pahInheritAap:
          regMap[CONFIG_KEYS.REGISTRIES_PAH_INHERIT_AAP] !== 'false',
        hasPahToken: !!regMap[CONFIG_KEYS.REGISTRIES_PAH_TOKEN],
        certifiedContent:
          regMap[CONFIG_KEYS.REGISTRIES_CERTIFIED_CONTENT] !== 'false',
        validatedContent:
          regMap[CONFIG_KEYS.REGISTRIES_VALIDATED_CONTENT] !== 'false',
        galaxyEnabled:
          regMap[CONFIG_KEYS.REGISTRIES_GALAXY_ENABLED] !== 'false',
      },
      scm,
    };
  }

  async setLocalAdmin(enabled: boolean): Promise<void> {
    await this.dbHandler.setLocalAdminEnabled(enabled);
    this.logger.info(`Local admin access ${enabled ? 'enabled' : 'disabled'}`);
  }

  // --- Helpers ---

  private async upsertConfigValue(
    key: string,
    value: string,
    category: string,
  ): Promise<void> {
    const secret = isSecretKey(key);
    const storedValue = secret
      ? encrypt(value, this.backendSecret)
      : value;
    await this.dbHandler.upsertConfig(key, storedValue, secret, category);
  }

  private validateUrl(value: string | undefined, fieldName: string): void {
    if (!value || value.trim() === '') {
      throw new InputError(`${fieldName} is required`);
    }
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new InputError(
          `${fieldName} must use http or https protocol`,
        );
      }
    } catch (e) {
      if (e instanceof InputError) throw e;
      throw new InputError(`${fieldName} is not a valid URL: ${value}`);
    }
  }

  private validateNonEmpty(
    value: string | undefined,
    fieldName: string,
  ): void {
    if (!value || value.trim() === '') {
      throw new InputError(`${fieldName} is required`);
    }
  }

  private validateSCMProvider(provider: string): void {
    if (
      !(VALID_SCM_PROVIDERS as readonly string[]).includes(provider)
    ) {
      throw new InputError(
        `Invalid SCM provider "${provider}". Supported: ${VALID_SCM_PROVIDERS.join(', ')}`,
      );
    }
  }

  private rowsToMap(rows: { config_key: string; config_value: string }[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const row of rows) {
      // Never expose decrypted secrets — only report presence
      map[row.config_key] = row.config_value;
    }
    return map;
  }
}
