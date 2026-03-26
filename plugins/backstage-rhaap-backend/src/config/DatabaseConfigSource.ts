import { Knex } from 'knex';
import { ConfigRow } from '@ansible/backstage-rhaap-common';
import { buildConfigTree } from './configTreeBuilder';
import { decrypt, isEncrypted } from './encryption';

/**
 * A Backstage ConfigSource that reads configuration from the portal_config
 * database table and returns it as a nested config object.
 *
 * This is used during backend startup to merge DB-stored config with
 * the static app-config.yaml. Community plugins (GitHub/GitLab SCM,
 * auth providers) see the merged config transparently.
 *
 * Full implementation in Phase 2 (T2.3). This is the interface + core logic.
 */
export class DatabaseConfigSource {
  private constructor(
    private readonly knex: Knex,
    private readonly backendSecret: string,
  ) {}

  static create(knex: Knex, backendSecret: string): DatabaseConfigSource {
    return new DatabaseConfigSource(knex, backendSecret);
  }

  /**
   * Reads all config from the database, decrypts secrets,
   * and returns the nested config tree.
   */
  async readConfigFromDb(
    authEnvironment: string = 'production',
  ): Promise<Record<string, any> | null> {
    const hasTable = await this.knex.schema.hasTable('portal_config');
    if (!hasTable) {
      return null;
    }

    const rows: ConfigRow[] = await this.knex('portal_config').select('*');
    if (rows.length === 0) {
      return null;
    }

    // Decrypt secret values
    const decryptedRows = rows.map(row => ({
      ...row,
      config_value:
        row.is_secret && isEncrypted(row.config_value)
          ? decrypt(row.config_value, this.backendSecret)
          : row.config_value,
    }));

    return buildConfigTree(decryptedRows, authEnvironment);
  }
}
