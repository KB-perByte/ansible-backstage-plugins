#!/usr/bin/env node

/**
 * portal-admin — Django-style management commands for the Ansible Portal.
 *
 * Connects directly to the database (SQLite or PostgreSQL) by reading
 * app-config YAML files. No running backend required.
 *
 * Usage:
 *   yarn portal-admin status
 *   yarn portal-admin reset-setup
 *   yarn portal-admin set-local-admin --enable
 *   yarn portal-admin connections
 *   yarn portal-admin clear-config
 *   yarn portal-admin clear-config --category aap
 *   yarn portal-admin show-config
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import knexFactory, { Knex } from 'knex';

// ---- DB Connection (self-contained, no Backstage deps) ----

function resolveConfigPaths(): string[] {
  const cwd = process.cwd();
  const searchDirs = [cwd, path.resolve(cwd, '../..')];
  const configNames = ['app-config.yaml', 'app-config.local.yaml'];
  const paths: string[] = [];

  for (const dir of searchDirs) {
    for (const name of configNames) {
      const p = path.resolve(dir, name);
      if (fs.existsSync(p) && !paths.includes(p)) {
        paths.push(p);
      }
    }
  }
  return paths;
}

function mergeYaml(filePaths: string[]): Record<string, any> {
  let merged: Record<string, any> = {};
  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) continue;
    const parsed = parseYaml(fs.readFileSync(fp, 'utf8')) ?? {};
    merged = deepMerge(merged, parsed);
  }
  return merged;
}

function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_m, expr: string) => {
    const [name, def] = expr.split(':-');
    return process.env[name] ?? def ?? '';
  });
}

function createKnex(config: Record<string, any>): Knex {
  const db = config.backend?.database ?? {};
  const client = db.client ?? 'better-sqlite3';
  let connection: any = db.connection ?? ':memory:';

  if (typeof connection === 'string') {
    connection = resolveEnvVars(connection);
  } else if (typeof connection === 'object' && connection.directory) {
    // SQLite directory format → resolve to file
    const candidates = [
      path.resolve(connection.directory, 'rhaap-backend.sqlite'),
      path.resolve(
        'packages',
        'backend',
        connection.directory,
        'rhaap-backend.sqlite',
      ),
    ];
    let filename = candidates[0];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        filename = c;
        break;
      }
    }
    connection = { filename };
  }

  return knexFactory({
    client,
    connection,
    useNullAsDefault: client === 'better-sqlite3',
  });
}

// ---- Commands ----

async function cmdStatus(knex: Knex) {
  const hasTable = await knex.schema.hasTable('portal_setup');
  if (!hasTable) {
    console.log('portal_setup table does not exist. Run the backend first to initialize.');
    return;
  }

  const row = await knex('portal_setup').first();
  console.log('Setup Status:');
  console.log(`  setupComplete:     ${row.setup_complete ? 'true' : 'false'}`);
  console.log(`  localAdminEnabled: ${row.local_admin_enabled ? 'true' : 'false'}`);
  console.log(`  createdAt:         ${row.created_at}`);
  console.log(`  updatedAt:         ${row.updated_at}`);

  const configCount = await knex('portal_config').count('* as count').first();
  console.log(`  configEntries:     ${configCount?.count ?? 0}`);
}

async function cmdResetSetup(knex: Knex, clearConfig: boolean) {
  await knex('portal_setup').update({
    setup_complete: false,
    local_admin_enabled: true,
    updated_at: knex.fn.now(),
  });

  if (clearConfig) {
    const deleted = await knex('portal_config').delete();
    console.log(`Deleted ${deleted} config entries.`);
  }

  console.log('Setup reset. setupComplete=false, localAdminEnabled=true');
  if (!clearConfig) {
    console.log('Existing connections preserved. Use --clear-config to also remove all stored config.');
  }
  console.log('Restart the backend to enter setup mode.');
}

async function cmdFullReset(knex: Knex) {
  await knex('portal_config').delete();
  await knex('portal_setup').update({
    setup_complete: false,
    local_admin_enabled: true,
    updated_at: knex.fn.now(),
  });
  console.log('Full reset complete:');
  console.log('  - All config entries deleted (AAP, registries, SCM credentials)');
  console.log('  - setupComplete=false, localAdminEnabled=true');
  console.log('Restart the backend to enter setup mode from scratch.');
}

async function cmdSetLocalAdmin(knex: Knex, enable: boolean) {
  await knex('portal_setup').update({
    local_admin_enabled: enable,
    updated_at: knex.fn.now(),
  });
  console.log(`localAdminEnabled set to ${enable}`);
}

async function cmdConnections(knex: Knex) {
  const hasTable = await knex.schema.hasTable('portal_config');
  if (!hasTable) {
    console.log('No config table found.');
    return;
  }

  const rows = await knex('portal_config')
    .select('config_key', 'config_value', 'is_secret', 'category')
    .orderBy(['category', 'config_key']);

  if (rows.length === 0) {
    console.log('No connections configured.');
    return;
  }

  console.log('Connections:');
  let currentCategory = '';
  for (const row of rows) {
    if (row.category !== currentCategory) {
      currentCategory = row.category;
      console.log(`\n  [${currentCategory}]`);
    }
    const value = row.is_secret ? '********' : row.config_value;
    console.log(`    ${row.config_key} = ${value}`);
  }
  console.log('');
}

async function cmdShowConfig(knex: Knex) {
  const hasTable = await knex.schema.hasTable('portal_config');
  if (!hasTable) {
    console.log('No config table found.');
    return;
  }

  const rows = await knex('portal_config')
    .select('id', 'config_key', 'config_value', 'is_secret', 'category', 'updated_at')
    .orderBy(['category', 'config_key']);

  if (rows.length === 0) {
    console.log('No config entries.');
    return;
  }

  // Table format
  const header = 'ID  | Category     | Key                             | Value                          | Secret | Updated';
  const sep = '-'.repeat(header.length);
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    const val = row.is_secret ? '********' : row.config_value;
    console.log(
      `${String(row.id).padEnd(4)}| ${row.category.padEnd(13)}| ${row.config_key.padEnd(32)}| ${val.substring(0, 30).padEnd(31)}| ${row.is_secret ? 'yes' : 'no '}    | ${row.updated_at}`,
    );
  }
}

async function cmdClearConfig(knex: Knex, category?: string) {
  if (category) {
    const deleted = await knex('portal_config')
      .where('category', category)
      .delete();
    console.log(`Deleted ${deleted} config entries in category "${category}".`);
  } else {
    const deleted = await knex('portal_config').delete();
    console.log(`Deleted ${deleted} config entries (all).`);
  }
}

// ---- Main ----

const USAGE = `
portal-admin — Management commands for the Ansible Portal

Commands:
  status                           Show setup status and config count
  reset-setup                      Reset to setup mode (preserves existing config)
  reset-setup --clear-config       Reset to setup mode AND delete all stored config
  full-reset                       Delete all config + reset setup (start from scratch)
  set-local-admin --enable         Enable local admin access
  set-local-admin --disable        Disable local admin access
  connections                      List all configured connections (secrets masked)
  show-config                      Show all config entries in table format
  clear-config                     Delete all stored config
  clear-config --category X        Delete config for a specific category (aap, registries, scm_github, scm_gitlab)

Options:
  --config <path>                  Path to app-config.yaml (can be repeated)

Examples:
  yarn portal-admin status
  yarn portal-admin full-reset                  # Wipe everything and start fresh
  yarn portal-admin reset-setup                 # Re-enter setup mode (keep connections)
  yarn portal-admin reset-setup --clear-config  # Re-enter setup mode (wipe connections)
  yarn portal-admin set-local-admin --enable
  yarn portal-admin connections
  yarn portal-admin clear-config --category aap
`.trim();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  const configPaths = resolveConfigPaths();
  if (configPaths.length === 0) {
    console.error('Error: No app-config.yaml found. Run from the repo root.');
    process.exit(1);
  }

  const yamlConfig = mergeYaml(configPaths);
  const knex = createKnex(yamlConfig);

  try {
    switch (command) {
      case 'status':
        await cmdStatus(knex);
        break;

      case 'reset-setup': {
        const clearConfig = args.includes('--clear-config');
        await cmdResetSetup(knex, clearConfig);
        break;
      }

      case 'full-reset':
        await cmdFullReset(knex);
        break;

      case 'set-local-admin': {
        const flag = args[1];
        if (flag === '--enable') {
          await cmdSetLocalAdmin(knex, true);
        } else if (flag === '--disable') {
          await cmdSetLocalAdmin(knex, false);
        } else {
          console.error('Usage: portal-admin set-local-admin --enable|--disable');
          process.exit(1);
        }
        break;
      }

      case 'connections':
        await cmdConnections(knex);
        break;

      case 'show-config':
        await cmdShowConfig(knex);
        break;

      case 'clear-config': {
        const catIdx = args.indexOf('--category');
        const category = catIdx >= 0 ? args[catIdx + 1] : undefined;
        await cmdClearConfig(knex, category);
        break;
      }

      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        process.exit(1);
    }
  } finally {
    await knex.destroy();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
