import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.string('id').primary();
    t.string('name').notNullable();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.enu('role', ['admin', 'staff'], { useNative: false, enumName: 'user_role' }).notNullable().defaultTo('staff');
    t.enu('status', ['active', 'suspended'], { useNative: false, enumName: 'user_status' }).notNullable().defaultTo('active');
    t.timestamp('last_login_at').nullable();
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('users', (t) => {
    t.index(['email']);
    t.index(['role']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
