import type { PoolClient } from 'pg';
import { applyTactics, mulberry32, simulateMatch } from '../lib';
import type { ManagerChoices, ManagerMatchSummary, SimulatedMatch, SimulationPlayer } from '../lib';
import { HALF_TIME_PAUSE_SECONDS } from '../lib/matchClock';

interface RatedClub {
  id: number;
  name: string;
  attack: number;
  defence: number;
}

interface DatabaseSquadPlayer extends SimulationPlayer {
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
  managerChoices?: ManagerChoices,
  options: { live?: boolean; managerOnlyLive?: boolean; kickoffAt?: Date; durationSeconds?: number } = {},
): Promise<{ matchesPlayed: number; managerMatch: ManagerMatchSummary | null }> {
  const matches = await client.query<{
    id: number;
    home_club_id: number;
    away_club_id: number;
  }>(
    `SELECT id, home_club_id, away_club_id
     FROM matches
     WHERE league_id = $1 AND matchday = $2 AND status = 'scheduled' AND home_goals IS NULL
     ORDER BY id`,
    [leagueId, matchday],
  );

  if (matches.rows.length === 0) return { matchesPlayed: 0, managerMatch: null };

  const clubIds = [...new Set(matches.rows.flatMap((match) => [match.home_club_id, match.away_club_id]))];
  const [clubsResult, playersResult] = await Promise.all([
    client.query<RatedClub>(
      'SELECT id, name, attack, defence FROM clubs WHERE league_id = $1 AND id = ANY($2::int[])',
      [leagueId, clubIds],
    ),
    client.query<DatabaseSquadPlayer>(
      'SELECT id, club_id, name, position FROM players WHERE club_id = ANY($1::int[]) ORDER BY id',
      [clubIds],
    ),
  ]);
  const clubs = new Map(clubsResult.rows.map((club) => [club.id, club]));
  const squads = new Map<number, DatabaseSquadPlayer[]>();
  for (const player of playersResult.rows) {
    const squad = squads.get(player.club_id) ?? [];
    squad.push(player);
    squads.set(player.club_id, squad);
  }

  let managerMatch: ManagerMatchSummary | null = null;
  for (const match of matches.rows) {
    const home = clubs.get(match.home_club_id);
    const away = clubs.get(match.away_club_id);
    if (!home || !away) throw new Error('Fixture references clubs outside its league');
    const rng = mulberry32(matchSeed(leagueId, match.id));
    const homeClub = { ...home, players: squads.get(home.id) ?? [] };
    const awayClub = { ...away, players: squads.get(away.id) ?? [] };
    const homeIsManager = managerChoices?.clubId === home.id;
    const awayIsManager = managerChoices?.clubId === away.id;
    const result = simulateMatch(
      homeIsManager ? applyTactics(homeClub, managerChoices.tactics) : homeClub,
      awayIsManager ? applyTactics(awayClub, managerChoices.tactics) : awayClub,
      rng,
    );

    const matchIsLive = Boolean(options.live && (!options.managerOnlyLive || homeIsManager || awayIsManager));
    if (matchIsLive) {
      await client.query(
        `UPDATE matches
         SET status = 'live', kickoff_at = $1, duration_seconds = $2,
           home_goals = NULL, away_goals = NULL, home_xg = NULL, away_xg = NULL,
           played_at = NULL, simulation_result = $3::jsonb
         WHERE id = $4`,
        [options.kickoffAt ?? new Date(), options.durationSeconds ?? 90, JSON.stringify(result), match.id],
      );
    } else {
      await client.query(
        `UPDATE matches
         SET home_goals = $1, away_goals = $2, home_xg = $3, away_xg = $4,
           played_at = NOW(), status = 'finished', kickoff_at = COALESCE(kickoff_at, NOW()),
           simulation_result = $5::jsonb
         WHERE id = $6`,
        [result.homeGoals, result.awayGoals, result.expectedGoals.home, result.expectedGoals.away,
          JSON.stringify(result), match.id],
      );
    }

    for (const event of result.events) {
      await client.query(
        `INSERT INTO match_events
          (match_id, seq, minute, minute_extra, type, club_id, player_id,
           secondary_player_id, payload, commentary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [match.id, event.seq, event.minute, event.minuteExtra, event.type,
          event.clubId, event.playerId, event.secondaryPlayerId,
          JSON.stringify(event.payload), event.commentary],
      );
    }
    if (!matchIsLive) await storeMatchStats(client, match.id, result);
    if (managerChoices && (homeIsManager || awayIsManager)) {
      const isHome = homeIsManager;
      managerMatch = {
        matchId: match.id,
        matchday,
        clubId: managerChoices.clubId,
        opponentId: isHome ? away.id : home.id,
        isHome,
        tactics: managerChoices.tactics,
        expectedGoalsFor: isHome ? result.expectedGoals.home : result.expectedGoals.away,
        expectedGoalsAgainst: isHome ? result.expectedGoals.away : result.expectedGoals.home,
        goalsFor: isHome ? result.homeGoals : result.awayGoals,
        goalsAgainst: isHome ? result.awayGoals : result.homeGoals,
      };
    }
  }

  return { matchesPlayed: matches.rows.length, managerMatch };
}

async function storeMatchStats(client: PoolClient, matchId: number, result: SimulatedMatch): Promise<void> {
  for (const stats of result.teamStats) {
    await client.query(
      `INSERT INTO match_team_stats
        (match_id, club_id, possession, shots, shots_on_target, corners, fouls, saves)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [matchId, stats.clubId, stats.possession, stats.shots, stats.shotsOnTarget,
        stats.corners, stats.fouls, stats.saves],
    );
  }
  for (const stats of result.playerStats) {
    await client.query(
      `INSERT INTO player_match_stats
        (match_id, club_id, player_id, is_starter, minutes_played, shots, shots_on_target, xg, key_passes, tackles)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [matchId, stats.clubId, stats.playerId, stats.isStarter, stats.minutesPlayed,
        stats.shots, stats.shotsOnTarget, stats.xg, stats.keyPasses, stats.tackles],
    );
  }
}

export async function finalizeElapsedMatches(client: PoolClient): Promise<number> {
  const dueMatches = await client.query<{ id: number; simulation_result: SimulatedMatch }>(
    `SELECT id, simulation_result
     FROM matches
     WHERE status = 'live' AND kickoff_at IS NOT NULL
       AND kickoff_at + make_interval(secs => duration_seconds + $1) <= NOW()
     FOR UPDATE SKIP LOCKED`,
    [HALF_TIME_PAUSE_SECONDS],
  );
  for (const match of dueMatches.rows) {
    const result = match.simulation_result;
    await client.query(
      `UPDATE matches
       SET status = 'finished', home_goals = $1, away_goals = $2,
         home_xg = $3, away_xg = $4, played_at = NOW()
       WHERE id = $5 AND status = 'live'`,
      [result.homeGoals, result.awayGoals, result.expectedGoals.home, result.expectedGoals.away, match.id],
    );
    await storeMatchStats(client, match.id, result);
  }
  return dueMatches.rows.length;
}

export async function findNextMatchday(client: PoolClient, leagueId: number): Promise<number | null> {
  const result = await client.query<{ matchday: number | null }>(
    `SELECT MIN(matchday) AS matchday FROM matches
     WHERE league_id = $1 AND status = 'scheduled' AND home_goals IS NULL`,
    [leagueId],
  );
  return result.rows[0]?.matchday ?? null;
}
