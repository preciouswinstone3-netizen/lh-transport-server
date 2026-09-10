import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (t) => {
    t.string('id').primary();
    t.string('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('user_name').nullable();
    t.string('action').notNullable();
    t.string('entity_type').nullable();
    t.string('entity_id').nullable();
    t.text('description').nullable();
    t.string('ip_address').nullable();
    t.string('user_agent').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
  await knex.schema.alterTable('audit_logs', (t) => {
    t.index(['user_id']);
    t.index(['action']);
    t.index(['entity_type', 'entity_id']);
    t.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
