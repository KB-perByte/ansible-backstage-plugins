import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import {
  coreServices,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { ConfigSources, type ConfigSource } from '@backstage/config-loader';
import {
  createBootstrapConnection,
  resolveAppConfigPaths,
} from './bootstrapConnection';
import { DatabaseConfigSource } from './DatabaseConfigSource';

function mergeYamlFilesForEnv(filePaths: string[]): Record<string, any> {
  let merged: Record<string, any> = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseYaml(content) ?? {};
    merged = { ...merged, ...parsed };
  }
  return merged;
}

/**
 * A ConfigSource that wraps a static config object loaded from the database.
 */
class StaticDbConfigSource implements ConfigSource {
  constructor(private readonly data: Record<string, any>) {}

  async *readConfigData() {
    yield {
      configs: [{ data: this.data, context: 'portal-admin-database' }],
    };
  }
}

/**
 * Creates a custom rootConfig service factory that merges the standard
 * app-config.yaml sources with our DatabaseConfigSource.
 *
 * Config merge order (later wins):
 *   1. app-config.yaml (static, from Helm chart / filesystem)
 *   2. Environment variables (APP_CONFIG_*)
 *   3. Database config (portal_config table) — our DatabaseConfigSource
 *
 * Usage:
 *   For RHDH dynamic plugins: Set ENABLE_CORE_ROOTCONFIG_OVERRIDE=true
 *   For local dev: Register this factory in the backend directly
 *
 * @param argv - CLI arguments for config file resolution
 */
export function createRootConfigWithDatabaseSource(argv?: string[]) {
  return createServiceFactory({
    service: coreServices.rootConfig,
    deps: {},
    async factory() {
      // 1. Create the default config source (files + env vars)
      const defaultSource = ConfigSources.default({ argv });

      // 2. Create our database config source
      const appConfigPaths = resolveAppConfigPaths(argv);
      let dbSource: ConfigSource | undefined;

      try {
        const knex = await createBootstrapConnection(appConfigPaths);
        const backendSecret =
          process.env.BACKEND_SECRET ?? 'development-secret';
        const configSource = DatabaseConfigSource.create(knex, backendSecret);
        // Detect auth environment from static config files
        const staticConfig = mergeYamlFilesForEnv(appConfigPaths);
        const authEnv = staticConfig?.auth?.environment ?? 'production';
        const dbConfig = await configSource.readConfigFromDb(authEnv);

        if (dbConfig && Object.keys(dbConfig).length > 0) {
          dbSource = new StaticDbConfigSource(dbConfig);
          console.log(
            '[portal-admin] Loaded DB config with keys:',
            Object.keys(dbConfig).join(', '),
          );
        } else {
          console.log('[portal-admin] No config found in database (empty or first boot)');
        }
      } catch (err) {
        // Database not available (first boot, migration not run yet, etc.)
        // Fall through to default config only — this is expected
        console.warn(
          '[portal-admin] Could not load database config, using static config only:',
          err instanceof Error ? err.message : err,
        );
      }

      // 3. Merge sources (default first, DB overrides)
      const mergedSource = dbSource
        ? ConfigSources.merge([defaultSource, dbSource])
        : defaultSource;

      // 4. Convert to Config object
      return await ConfigSources.toConfig(mergedSource);
    },
  });
}
