import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payments', (t) => {
    t.string('id').primary();
    t.string('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.decimal('amount', 14, 2).notNullable();
    t.date('payment_date').notNullable();
    t.string('payment_method').notNullable();
    t.string('reference').nullable();
    t.text('notes').nullable();
    t.string('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('payments', (t) => {
    t.index(['invoice_id']);
    t.index(['payment_date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payments');
}
