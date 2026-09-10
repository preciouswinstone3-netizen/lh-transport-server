import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('invoice_items', (t) => {
    t.string('id').primary();
    t.string('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.integer('position').notNullable().defaultTo(0);
    t.text('description').notNullable();
    t.string('service_type').nullable();
    t.string('vehicle').nullable();
    t.string('vehicle_registration').nullable();
    t.string('driver').nullable();
    t.string('pickup_location').nullable();
    t.string('delivery_location').nullable();
    t.date('trip_date').nullable();
    t.decimal('quantity', 12, 2).notNullable().defaultTo(1);
    t.string('unit').notNullable().defaultTo('trip');
    t.decimal('rate', 14, 2).notNullable().defaultTo(0);
    t.decimal('discount_percent', 6, 2).notNullable().defaultTo(0);
    t.decimal('tax_percent', 6, 2).notNullable().defaultTo(0);
    t.decimal('total', 14, 2).notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('invoice_items', (t) => {
    t.index(['invoice_id']);
    t.index(['vehicle_registration']);
    t.index(['driver']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('invoice_items');
}
