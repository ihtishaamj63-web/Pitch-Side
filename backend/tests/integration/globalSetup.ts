import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

export default async function globalSetup() {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const credentials = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5433),
  };

  const admin = new Client({ ...credentials, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE pitch_test');
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== '42P04') {
      throw error;
    }
  } finally {
    await admin.end();
  }

  const testDb = new Client({ ...credentials, database: 'pitch_test' });
  await testDb.connect();
  try {
    await testDb.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const schema = await fs.readFile(path.resolve(__dirname, '../../../sql/schema.sql'), 'utf8');
    await testDb.query(schema);
  } finally {
    await testDb.end();
  }
}
