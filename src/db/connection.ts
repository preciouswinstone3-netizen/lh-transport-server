import knexLib from 'knex';
import config from './knexfile';

export const db = knexLib(config);

export default db;
