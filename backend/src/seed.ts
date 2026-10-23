import { pool } from './db';
import { ensureDemoLeague } from './services/demo';

void ensureDemoLeague()
  .then((leagueId) => {
    console.log(`Demo league is ready (id ${leagueId}).`);
  })
  .catch((error: unknown) => {
    console.error('Unable to seed demo league:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
