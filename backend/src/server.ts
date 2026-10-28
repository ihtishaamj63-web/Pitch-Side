import { app } from './app';
import { pool } from './db';
import { applyMigrations } from './services/migrations';
import { finalizeElapsedMatches } from './services/simulation';
import { withTransaction } from './services/transaction';
import { publishLiveClockTicks } from './services/liveStream';

async function start() {
  const appliedMigrations = await applyMigrations(pool);
  if (appliedMigrations.length > 0) {
    console.log(`Applied database migrations: ${appliedMigrations.join(', ')}`);
  }


  const port = Number(process.env.PORT ?? 4000);
  const server = app.listen(port, () => {
    console.log(`Pitch API listening on http://localhost:${port}`);
  });
  const liveTicker = setInterval(() => {
    void withTransaction(finalizeElapsedMatches)
      .then(() => publishLiveClockTicks(pool))
      .catch((error: unknown) => {
      console.error('Live match ticker failed:', error);
    });
  }, 1_000);

  const shutdown = () => {
    clearInterval(liveTicker);
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
