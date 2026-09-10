import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('customers', (t) => {
    t.string('id').primary();
    t.string('name').notNullable();
    t.string('contact_person').nullable();
    t.string('phone').nullable();
    t.string('email').nullable();
    t.text('address').nullable();
    t.text('postal_address').nullable();
    t.string('tax_number').nullable();
    t.string('registration_number').nullable();
    t.string('customer_reference').nullable();
    t.text('notes').nullable();
    t.string('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('customers', (t) => {
    t.index(['name']);
    t.index(['phone']);
    t.index(['email']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customers');
}
