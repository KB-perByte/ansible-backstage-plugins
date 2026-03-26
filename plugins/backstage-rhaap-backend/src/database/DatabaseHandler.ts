import { Knex } from 'knex';
import { ConfigRow } from '@ansible/backstage-rhaap-common';
import { migrateDb } from './migrateDb';

type SetupState = {
  setup_complete: boolean;
  local_admin_enabled: boolean;
};

/**
 * Database handler for portal_setup and portal_config tables.
 * Uses Knex for cross-database compatibility (PostgreSQL + SQLite).
 */
export class DatabaseHandler {
  private constructor(private readonly knex: Knex) {}

  static async create(knex: Knex): Promise<DatabaseHandler> {
    await migrateDb(knex);
    return new DatabaseHandler(knex);
  }

  // --- portal_setup ---

  async getSetupState(): Promise<SetupState> {
    const row = await this.knex('portal_setup').where({ id: 1 }).first();
    if (!row) {
      return { setup_complete: false, local_admin_enabled: true };
    }
    return {
      setup_complete: Boolean(row.setup_complete),
      local_admin_enabled: Boolean(row.local_admin_enabled),
    };
  }

  async setSetupComplete(complete: boolean): Promise<void> {
    await this.knex('portal_setup')
      .where({ id: 1 })
      .update({ setup_complete: complete, updated_at: this.knex.fn.now() });
  }

  async setLocalAdminEnabled(enabled: boolean): Promise<void> {
    await this.knex('portal_setup')
      .where({ id: 1 })
      .update({ local_admin_enabled: enabled, updated_at: this.knex.fn.now() });
  }

  // --- portal_config ---

  async getAllConfig(): Promise<ConfigRow[]> {
    return this.knex('portal_config').select('*');
  }

  async getConfigByCategory(category: string): Promise<ConfigRow[]> {
    return this.knex('portal_config').where({ category }).select('*');
  }

  async getConfigByKey(configKey: string): Promise<ConfigRow | undefined> {
    return this.knex('portal_config')
      .where({ config_key: configKey })
      .first();
  }

  async upsertConfig(
    configKey: string,
    configValue: string,
    isSecret: boolean,
    category: string,
  ): Promise<void> {
    const existing = await this.getConfigByKey(configKey);
    if (existing) {
      await this.knex('portal_config')
        .where({ config_key: configKey })
        .update({
          config_value: configValue,
          is_secret: isSecret,
          category,
          updated_at: this.knex.fn.now(),
        });
    } else {
      await this.knex('portal_config').insert({
        config_key: configKey,
        config_value: configValue,
        is_secret: isSecret,
        category,
      });
    }
  }

  async deleteConfig(configKey: string): Promise<void> {
    await this.knex('portal_config').where({ config_key: configKey }).delete();
  }

  async deleteConfigByCategory(category: string): Promise<void> {
    await this.knex('portal_config').where({ category }).delete();
  }

  async hasConfigInCategory(category: string): Promise<boolean> {
    const row = await this.knex('portal_config')
      .where({ category })
      .first();
    return !!row;
  }
}
