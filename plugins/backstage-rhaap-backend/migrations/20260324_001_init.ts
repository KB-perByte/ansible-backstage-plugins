import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('portal_setup', table => {
    table.integer('id').primary().defaultTo(1);
    table.boolean('setup_complete').notNullable().defaultTo(false);
    table.boolean('local_admin_enabled').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // Insert the singleton row
  await knex('portal_setup').insert({ id: 1 });

  await knex.schema.createTable('portal_config', table => {
    table.increments('id').primary();
    table.text('config_key').notNullable().unique();
    table.text('config_value').notNullable();
    table.boolean('is_secret').notNullable().defaultTo(false);
    table.text('category').notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.alterTable('portal_config', table => {
    table.index('category');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('portal_config');
  await knex.schema.dropTableIfExists('portal_setup');
}
