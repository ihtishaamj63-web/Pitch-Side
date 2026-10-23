import type { PoolClient } from 'pg';
import { mulberry32, simulateMatch } from '../lib';
import type { SimulationPlayer } from '../lib';

interface RatedClub {
  id: number;
  name: string;
  attack: number;
  defence: number;
}

interface SquadPlayer extends SimulationPlayer {
  club_id: number;
}

function matchSeed(leagueId: number, matchId: number) {
  let value = Math.imul(leagueId, 0x45d9f3b) ^ matchId;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

export async function simulateMatchday(
  client: PoolClient,
  leagueId: number,
  matchday: number,
) {
  const matches = await client.query<{
    id: number;
    home_club_id: number;
    away_club_id: number;
  }>(
    `SELECT id, home_club_id, away_club_id
     FROM matches
     WHERE league_id = $1 AND matchday = $2 AND home_goals IS NULL
     ORDER BY id`,
    [leagueId, matchday],
  );

  if (matches.rows.length === 0) return 0;

  const clubIds = [...new Set(matches.rows.flatMap((match) => [match.home_club_id, match.away_club_id]))];
  const [clubsResult, playersResult] = await Promise.all([
    client.query<RatedClub>(
      'SELECT id, name, attack, defence FROM clubs WHERE league_id = $1 AND id = ANY($2::int[])',
      [leagueId, clubIds],
    ),
    client.query<SquadPlayer>(
      'SELECT id, club_id, name, position FROM players WHERE club_id = ANY($1::int[]) ORDER BY id',
      [clubIds],
    ),
  ]);
  const clubs = new Map(clubsResult.rows.map((club) => [club.id, club]));
  const squads = new Map<number, SquadPlayer[]>();
  for (const player of playersResult.rows) {
    const squad = squads.get(player.club_id) ?? [];
    squad.push(player);
    squads.set(player.club_id, squad);
  }

  for (const match of matches.rows) {
    const home = clubs.get(match.home_club_id);
    const away = clubs.get(match.away_club_id);
    if (!home || !away) throw new Error('Fixture references clubs outside its league');
    const rng = mulberry32(matchSeed(leagueId, match.id));
    const result = simulateMatch(
      { ...home, players: squads.get(home.id) ?? [] },
      { ...away, players: squads.get(away.id) ?? [] },
      rng,
    );

    await client.query(
      'UPDATE matches SET home_goals = $1, away_goals = $2, played_at = NOW() WHERE id = $3',
      [result.homeGoals, result.awayGoals, match.id],
    );

    for (const event of result.scorers) {
      await client.query(
        'INSERT INTO goals (match_id, club_id, player_id, minute) VALUES ($1, $2, $3, $4)',
        [match.id, event.clubId, event.playerId, event.minute],
      );
    }
  }

  return matches.rows.length;
}

export async function findNextMatchday(client: PoolClient, leagueId: number): Promise<number | null> {
  const result = await client.query<{ matchday: number | null }>(
    'SELECT MIN(matchday) AS matchday FROM matches WHERE league_id = $1 AND home_goals IS NULL',
    [leagueId],
  );
  return result.rows[0]?.matchday ?? null;
}
