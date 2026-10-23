import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const requiredEnvironment = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME'] as const;
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);

if (missingEnvironment.length > 0) {
  throw new Error(`Missing database configuration: ${missingEnvironment.join(', ')}`);
}

export const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT ?? 5433),
});
