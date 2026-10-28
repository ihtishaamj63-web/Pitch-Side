import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';

const liveUpdates = new EventEmitter();
liveUpdates.setMaxListeners(0);
let previouslyLiveLeagues = new Set<number>();

export function subscribeToLeague(leagueId: number, listener: (payload: { now: string; status: 'live' | 'idle' }) => void): () => void {
  const eventName = `league:${leagueId}`;
  liveUpdates.on(eventName, listener);
  return () => liveUpdates.off(eventName, listener);
}

/** One database read per server tick; connected clients share the in-process fan-out. */
export async function publishLiveClockTicks(pool: Pool): Promise<void> {
  const result = await pool.query<{ league_id: number }>(
    `SELECT DISTINCT league_id FROM matches WHERE status = 'live'`,
  );
  const activeLeagues = new Set(result.rows.map(({ league_id: leagueId }) => leagueId));
  const now = new Date().toISOString();
  new Set([...activeLeagues, ...previouslyLiveLeagues]).forEach((leagueId) => {
    liveUpdates.emit(`league:${leagueId}`, { now, status: activeLeagues.has(leagueId) ? 'live' : 'idle' });
  });
  previouslyLiveLeagues = activeLeagues;
}
