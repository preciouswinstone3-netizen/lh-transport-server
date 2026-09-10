import 'dotenv/config';
import path from 'path';
import type { Knex } from 'knex';

const isPg = (process.env.DB_CLIENT || 'sqlite3') === 'pg';

const config: Knex.Config = isPg
  ? {
      client: 'pg',
      connection: process.env.DATABASE_URL,
      pool: { min: 2, max: 10 },
      migrations: {
        directory: path.join(__dirname, 'migrations'),
        extension: 'ts',
      },
      seeds: {
        directory: path.join(__dirname, 'seeds'),
        extension: 'ts',
      },
    }
  : {
      client: 'better-sqlite3',
      connection: {
        // Resolved relative to the server package root (not process.cwd()), so this
        // works the same whether started via `npm run dev` or the `knex` CLI (which
        // changes its working directory to the knexfile's folder).
        filename: path.join(
          __dirname,
          '..',
          '..',
          (process.env.SQLITE_FILE || './data/lh_transport.sqlite3').replace(/^\.\//, '')
        ),
      },
      useNullAsDefault: true,
      pool: {
        afterCreate: (conn: any, cb: any) => {
          conn.pragma('journal_mode = WAL');
          conn.pragma('foreign_keys = ON');
          cb();
        },
      },
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
