import fs from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';

async function findMigrationsDirectory(): Promise<string> {
  const candidates = [
    path.resolve(__dirname, '../../sql/migrations'),
    path.resolve(__dirname, '../../../sql/migrations'),
    path.resolve(process.cwd(), 'sql/migrations'),
    path.resolve(process.cwd(), '../sql/migrations'),
    '/app/sql/migrations',
  ];

  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) return candidate;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error
        && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Could not locate sql/migrations directory (tried: ${candidates.join(', ')})`);
}

export async function applyMigrations(pool: Pool): Promise<string[]> {
  const migrationsDirectory = await findMigrationsDirectory();
  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [71938421]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );

    const applied: string[] = [];
    for (const file of files) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file],
      );
      if (existing.rowCount) continue;

      const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      applied.push(file);
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
