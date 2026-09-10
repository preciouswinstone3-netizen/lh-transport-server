import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('company_settings', (t) => {
    t.string('id').primary().defaultTo('singleton');
    // Company information
    t.string('company_name').notNullable().defaultTo('LH Transport');
    t.text('logo_data_url').nullable();
    t.text('address').nullable();
    t.string('phone').nullable();
    t.string('email').nullable();
    t.string('website').nullable();
    t.string('tax_number').nullable();
    t.string('registration_number').nullable();

    // Invoice settings
    t.string('invoice_prefix').notNullable().defaultTo('LH-INV');
    t.integer('invoice_starting_number').notNullable().defaultTo(1);
    t.integer('invoice_next_number').notNullable().defaultTo(1);
    t.string('default_currency').notNullable().defaultTo('MWK');
    t.decimal('default_tax_rate', 6, 2).notNullable().defaultTo(16.5);
    t.integer('default_payment_terms_days').notNullable().defaultTo(14);
    t.text('invoice_footer').nullable();
    t.text('terms_and_conditions').nullable();

    // Payment details
    t.string('bank_name').nullable();
    t.string('bank_account_name').nullable();
    t.string('bank_account_number').nullable();
    t.string('bank_branch').nullable();
    t.text('mobile_money_details').nullable();
    t.text('other_payment_instructions').nullable();

    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('company_settings');
}
