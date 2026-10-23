import { app } from './app';
import { pool } from './db';
import { ensureDemoLeague } from './services/demo';

async function start() {
  if (process.env.SEED_DEMO !== 'false') {
    await ensureDemoLeague();
  }

  const port = Number(process.env.PORT ?? 4000);
  const server = app.listen(port, () => {
    console.log(`Pitch API listening on http://localhost:${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void start().catch(async (error: unknown) => {
  console.error('Failed to start Pitch API:', error);
  await pool.end();
  process.exitCode = 1;
});
