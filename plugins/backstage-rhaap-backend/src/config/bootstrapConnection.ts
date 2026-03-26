import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import knexFactory, { Knex } from 'knex';
import { resolvePackagePath } from '@backstage/backend-plugin-api';

/**
 * Creates a standalone Knex database connection by reading database config
 * directly from app-config YAML files. This bypasses Backstage's config system
 * to avoid the circular dependency: DatabaseConfigSource needs DB, but
 * Backstage's DB service needs rootConfig which includes our ConfigSource.
 *
 * @param appConfigPaths - Paths to app-config YAML files (in merge order)
 * @returns A Knex instance connected to the portal database
 */
export async function createBootstrapConnection(
  appConfigPaths: string[],
): Promise<Knex> {
  console.log('[portal-admin] Bootstrap config files:', appConfigPaths);
  const mergedConfig = mergeYamlFiles(appConfigPaths);
  const dbConfig = extractDatabaseConfig(mergedConfig);
  const knex = knexFactory(dbConfig);

  // Run migrations if tables don't exist
  const hasTable = await knex.schema.hasTable('portal_setup');
  if (!hasTable) {
    const migrationsDir = resolvePackagePath(
      '@ansible/backstage-rhaap-backend',
      'migrations',
    );
    if (fs.existsSync(migrationsDir)) {
      await knex.migrate.latest({ directory: migrationsDir });
    }
  }

  return knex;
}

/**
 * Resolves app-config file paths from CLI args or defaults.
 */
export function resolveAppConfigPaths(argv?: string[]): string[] {
  const args = argv ?? process.argv;
  const paths: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      paths.push(path.resolve(args[i + 1]));
      i++;
    }
  }

  if (paths.length === 0) {
    // Default config file locations — check CWD and workspace root
    const cwd = process.cwd();
    // Backstage CLI runs from packages/backend/ but config files are at workspace root
    const workspaceRoot = path.resolve(cwd, '../..');
    const searchDirs = [cwd, workspaceRoot];
    const configNames = ['app-config.yaml', 'app-config.local.yaml'];

    for (const dir of searchDirs) {
      for (const name of configNames) {
        const p = path.resolve(dir, name);
        if (fs.existsSync(p) && !paths.includes(p)) {
          paths.push(p);
        }
      }
    }
  }

  return paths;
}

function mergeYamlFiles(filePaths: string[]): Record<string, any> {
  let merged: Record<string, any> = {};

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseYaml(content) ?? {};
    merged = deepMerge(merged, parsed);
  }

  return merged;
}

function extractDatabaseConfig(config: Record<string, any>): Knex.Config {
  const backend = config.backend ?? {};
  const database = backend.database ?? {};
  const client = database.client ?? 'better-sqlite3';
  let connection: any = database.connection ?? ':memory:';

  // Resolve environment variables in connection strings
  if (typeof connection === 'string') {
    connection = resolveEnvVars(connection);
  } else if (typeof connection === 'object') {
    connection = resolveEnvVarsInObject(connection);
  }

  // Handle Backstage SQLite directory format:
  // connection: { directory: './portal-dev-db' }
  // Convert to a specific file path for our bootstrap Knex connection
  console.log('[portal-admin] DB extracted config:', JSON.stringify({ client, connection }));
  console.log('[portal-admin] Raw database section:', JSON.stringify(database));

  // Backstage creates per-plugin SQLite files as: <pluginId>.sqlite in the directory.
  // The directory is resolved relative to the backend package root (packages/backend/).
  // We must use the same file so DatabaseConfigSource reads what the plugin wrote.
  if (
    client === 'better-sqlite3' &&
    typeof connection === 'object' &&
    connection.directory
  ) {
    // Backstage resolves the directory relative to CWD (which is packages/backend/ at runtime)
    // but our bootstrap runs before Backstage, so try both locations
    const candidates = [
      path.resolve(connection.directory, 'rhaap-backend.sqlite'),
      path.resolve('packages', 'backend', connection.directory, 'rhaap-backend.sqlite'),
    ];
    let filename = candidates[0]; // default
    for (const candidate of candidates) {
      console.log('[portal-admin] Checking DB path:', candidate, fs.existsSync(candidate) ? 'EXISTS' : 'NOT FOUND');
      if (fs.existsSync(candidate)) {
        filename = candidate;
        break;
      }
    }
    // Ensure directory exists
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    connection = { filename };
  }

  const knexConfig: Knex.Config = {
    client,
    connection,
    useNullAsDefault: client === 'better-sqlite3',
  };

  return knexConfig;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, envExpr: string) => {
    // Handle ${ENV_VAR:-default} syntax
    const [envName, defaultValue] = envExpr.split(':-');
    return process.env[envName] ?? defaultValue ?? '';
  });
}

function resolveEnvVarsInObject(
  obj: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = resolveEnvVars(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = resolveEnvVarsInObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
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
