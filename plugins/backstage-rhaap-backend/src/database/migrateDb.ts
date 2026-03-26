import { Knex } from 'knex';
import { resolvePackagePath } from '@backstage/backend-plugin-api';

/**
 * Runs database migrations for the portal admin tables.
 */
export async function migrateDb(knex: Knex): Promise<void> {
  const migrationsDir = resolvePackagePath(
    '@ansible/backstage-rhaap-backend',
    'migrations',
  );

  await knex.migrate.latest({
    directory: migrationsDir,
  });
}
