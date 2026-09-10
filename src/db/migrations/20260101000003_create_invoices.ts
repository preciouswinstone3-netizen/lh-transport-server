import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('invoices', (t) => {
    t.string('id').primary();
    t.string('invoice_number').notNullable().unique();
    t.string('customer_id').notNullable().references('id').inTable('customers').onDelete('RESTRICT');
    t.date('invoice_date').notNullable();
    t.date('due_date').notNullable();
    t.string('currency').notNullable().defaultTo('MWK');
    t.string('reference_number').nullable();
    t.string('customer_po_number').nullable();

    t.decimal('subtotal', 14, 2).notNullable().defaultTo(0);
    t.decimal('discount_total', 14, 2).notNullable().defaultTo(0);
    t.decimal('tax_total', 14, 2).notNullable().defaultTo(0);
    t.decimal('additional_charges', 14, 2).notNullable().defaultTo(0);
    t.decimal('total', 14, 2).notNullable().defaultTo(0);
    t.decimal('amount_paid', 14, 2).notNullable().defaultTo(0);
    t.decimal('balance', 14, 2).notNullable().defaultTo(0);

    t.enu(
      'status',
      ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      { useNative: false, enumName: 'invoice_status' }
    ).notNullable().defaultTo('draft');

    t.text('notes').nullable();
    t.string('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('invoices', (t) => {
    t.index(['invoice_number']);
    t.index(['customer_id']);
    t.index(['status']);
    t.index(['invoice_date']);
    t.index(['due_date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('invoices');
}
