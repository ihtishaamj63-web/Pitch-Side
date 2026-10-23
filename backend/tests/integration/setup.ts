import { pool } from '../../src/db';

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE leagues RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});
