import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    // A hash (not the raw token) of the current password-reset token, so a
    // database leak alone can't be used to reset anyone's password. Null
    // when there is no outstanding reset request.
    t.string('reset_token_hash').nullable();
    t.timestamp('reset_token_expires_at').nullable();
  });
  await knex.schema.alterTable('users', (t) => {
    t.index(['reset_token_hash']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropIndex(['reset_token_hash']);
    t.dropColumn('reset_token_hash');
    t.dropColumn('reset_token_expires_at');
  });
}
