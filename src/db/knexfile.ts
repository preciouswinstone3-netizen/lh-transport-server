import dotenv from 'dotenv';
import path from 'path';
import type { Knex } from 'knex';

// The knex CLI changes its working directory to this file's folder
// (src/db) before running, which breaks dotenv's default cwd-relative
// lookup for .env - it would silently look in src/db/.env (which doesn't
// exist) instead of the real server/.env. Loading with an explicit
// absolute path makes it work the same whether run via `npm run dev`,
// `npm run migrate`, or `npm run seed`.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Postgres (Supabase) only - no local/SQLite fallback. If DATABASE_URL is
// missing, fail loudly at startup instead of silently writing to a local
// file that looks like it's "working" but isn't touching the real database.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. This app only supports Postgres (Supabase) - ' +
      'set DATABASE_URL in your .env (local) or in your Vercel project\'s ' +
      'environment variables (production).'
  );
}

const config: Knex.Config = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    // Supabase's connection poolers present a cert chain that Node's
    // default trust store doesn't recognize, causing
    // SELF_SIGNED_CERT_IN_CHAIN even though the connection is legitimately
    // encrypted to the right host. Disabling strict chain verification
    // (not the encryption itself) is Supabase's own documented fix for
    // node-postgres.
    ssl: { rejectUnauthorized: false },
  },
  pool: { min: 2, max: 10 },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
    extension: 'ts',
  },
};

export default config;
