import { Router } from 'express';
import type { PoolClient } from 'pg';
import { computeTable } from '../lib';
import { pool } from '../db';
import { ApiError } from '../errors';
import { createLeague } from '../services/league';
import { findNextMatchday, simulateMatchday } from '../services/simulation';
import { withTransaction } from '../services/transaction';
import { createLeagueSchema, parseId } from '../validation';

export const leaguesRouter = Router();

async function requireLeague(id: number) {
  const result = await pool.query(
    `SELECT id, name, season_label, points_win, points_draw, top_zone, bottom_zone, created_at
     FROM leagues WHERE id = $1`,
    [id],
  );
  const league = result.rows[0];
  if (!league) throw new ApiError('League not found', 404);
  return league;
}

function readMatchday(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new ApiError('Matchday must be a positive integer', 400);
  }
  const matchday = Number(value);
  if (!Number.isSafeInteger(matchday)) throw new ApiError('Matchday must be a positive integer', 400);
  return matchday;
}

async function tableForLeague(
  league: { id: number; points_win: number; points_draw: number; top_zone: number; bottom_zone: number },
  upToMatchday?: number,
) {
  const [clubsResult, matchesResult] = await Promise.all([
    pool.query(
      `SELECT id, name, short_name, colour_primary, colour_secondary, attack, defence
       FROM clubs WHERE league_id = $1 ORDER BY id`,
      [league.id],
    ),
    pool.query(
      `SELECT matchday, home_club_id, away_club_id, home_goals, away_goals, played_at
       FROM matches
       WHERE league_id = $1 AND home_goals IS NOT NULL
         AND ($2::int IS NULL OR matchday <= $2)
       ORDER BY matchday, id`,
      [league.id, upToMatchday ?? null],
    ),
  ]);

  const clubs = clubsResult.rows.map((club) => ({
    id: club.id,
    name: club.name,
    attack: club.attack,
    defence: club.defence,
  }));
  const playedMatches = matchesResult.rows.map((match) => ({
    matchday: match.matchday,
    homeClubId: match.home_club_id,
    awayClubId: match.away_club_id,
    homeGoals: match.home_goals,
    awayGoals: match.away_goals,
    playedAt: match.played_at,
  }));
  const table = computeTable(clubs, playedMatches, {
    pointsWin: league.points_win,
    pointsDraw: league.points_draw,
  });
  const latestMatchday = upToMatchday ?? Math.max(0, ...matchesResult.rows.map((match) => match.matchday));
  const previousTable = latestMatchday > 0
    ? computeTable(
      clubs,
      matchesResult.rows
        .filter((match) => match.matchday < latestMatchday)
        .map((match) => ({
          matchday: match.matchday,
          homeClubId: match.home_club_id,
          awayClubId: match.away_club_id,
          homeGoals: match.home_goals,
          awayGoals: match.away_goals,
        })),
      { pointsWin: league.points_win, pointsDraw: league.points_draw },
    )
    : [];
  const previousPositions = new Map(previousTable.map((row) => [row.clubId, row.position]));
  const clubById = new Map(clubsResult.rows.map((club) => [club.id, club]));

  return table.map((row) => {
    const club = clubById.get(Number(row.clubId));
    if (!club) throw new Error('Table references a missing club');
    return {
      id: row.clubId,
      name: row.clubName,
      position: row.position,
      movement: (previousPositions.get(row.clubId) ?? row.position) - row.position,
      club_id: row.clubId,
      club_name: row.clubName,
      short_name: club.short_name,
      colour_primary: club.colour_primary,
      colour_secondary: club.colour_secondary,
      P: row.played,
      W: row.won,
      D: row.drawn,
      L: row.lost,
      GF: row.goalsFor,
      GA: row.goalsAgainst,
      GD: row.goalDifference,
      Pts: row.points,
      form: row.form,
    };
  });
}

async function lockLeague(client: PoolClient, leagueId: number) {
  const result = await client.query('SELECT id FROM leagues WHERE id = $1 FOR UPDATE', [leagueId]);
  if (result.rowCount === 0) throw new ApiError('League not found', 404);
}

leaguesRouter.get('/leagues', async (_req, res) => {
  const result = await pool.query(
    `SELECT l.id, l.name, l.season_label,
       (SELECT COUNT(*)::int FROM clubs c WHERE c.league_id = l.id) AS club_count,
       (SELECT COUNT(*)::int FROM matches m WHERE m.league_id = l.id AND m.home_goals IS NOT NULL) AS played_matches,
       (SELECT COUNT(*)::int FROM matches m WHERE m.league_id = l.id) AS total_matches
     FROM leagues l ORDER BY l.created_at DESC, l.id DESC`,
  );
  res.json(result.rows);
});

leaguesRouter.post('/leagues', async (req, res) => {
  const parsed = createLeagueSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Invalid league data', 400);
  }
  const league = await withTransaction((client) => createLeague(client, parsed.data));
  res.status(201).json(league);
});

leaguesRouter.get('/leagues/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const league = await requireLeague(id);
  const [clubs, progress] = await Promise.all([
    pool.query(
      `SELECT id, name, short_name, colour_primary, colour_secondary, attack, defence
       FROM clubs WHERE league_id = $1 ORDER BY name`,
      [id],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total_matches,
        COUNT(*) FILTER (WHERE home_goals IS NOT NULL)::int AS played_matches,
        COALESCE(MAX(matchday) FILTER (WHERE home_goals IS NOT NULL), 0)::int AS completed_matchdays
       FROM matches WHERE league_id = $1`,
      [id],
    ),
  ]);
  res.json({ league, clubs: clubs.rows, progress: progress.rows[0] });
});

leaguesRouter.delete('/leagues/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const result = await pool.query('DELETE FROM leagues WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) throw new ApiError('League not found', 404);
  res.status(204).end();
});

leaguesRouter.get('/leagues/:id/table', async (req, res) => {
  const id = parseId(req.params.id);
  const upToMatchday = readMatchday(req.query.upToMatchday);
  const league = await requireLeague(id);
  res.json(await tableForLeague(league, upToMatchday));
});

leaguesRouter.post('/leagues/:id/simulate/next', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const result = await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    const matchday = await findNextMatchday(client, leagueId);
    if (matchday === null) throw new ApiError('Season is already finished', 409);
    const matchesPlayed = await simulateMatchday(client, leagueId, matchday);
    return { matchday, matchesPlayed };
  });
  res.json(result);
});

leaguesRouter.post('/leagues/:id/simulate/all', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const result = await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    let matchdaysPlayed = 0;
    let matchesPlayed = 0;
    let matchday = await findNextMatchday(client, leagueId);
    while (matchday !== null) {
      matchesPlayed += await simulateMatchday(client, leagueId, matchday);
      matchdaysPlayed += 1;
      matchday = await findNextMatchday(client, leagueId);
    }
    return { matchdaysPlayed, matchesPlayed };
  });
  res.json(result);
});

leaguesRouter.post('/leagues/:id/reset', async (req, res) => {
  const leagueId = parseId(req.params.id);
  await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    await client.query(
      `DELETE FROM goals
       WHERE match_id IN (SELECT id FROM matches WHERE league_id = $1)`,
      [leagueId],
    );
    await client.query(
      `DELETE FROM yellow_cards
       WHERE match_id IN (SELECT id FROM matches WHERE league_id = $1)`,
      [leagueId],
    );
    for (const table of ['red_cards', 'fouls', 'match_team_stats', 'player_match_stats']) {
      await client.query(
        `DELETE FROM ${table} WHERE match_id IN (SELECT id FROM matches WHERE league_id = $1)`,
        [leagueId],
      );
    }
    await client.query(
      'UPDATE matches SET home_goals = NULL, away_goals = NULL, home_xg = NULL, away_xg = NULL, played_at = NULL WHERE league_id = $1',
      [leagueId],
    );
  });
  res.json({ status: 'reset' });
});

leaguesRouter.get('/leagues/:id/scorers', async (req, res) => {
  const leagueId = parseId(req.params.id);
  await requireLeague(leagueId);
  const result = await pool.query(
    `WITH goal_totals AS (
       SELECT g.player_id, COUNT(*)::int AS goals
       FROM goals g JOIN matches m ON m.id = g.match_id
       WHERE m.league_id = $1
       GROUP BY g.player_id
     ), assist_totals AS (
       SELECT g.assist_player_id AS player_id, COUNT(*)::int AS assists
       FROM goals g JOIN matches m ON m.id = g.match_id
       WHERE m.league_id = $1 AND g.assist_player_id IS NOT NULL
       GROUP BY g.assist_player_id
     ), card_totals AS (
       SELECT yc.player_id, COUNT(*)::int AS yellow_cards
       FROM yellow_cards yc JOIN matches m ON m.id = yc.match_id
       WHERE m.league_id = $1
       GROUP BY yc.player_id
     ), red_card_totals AS (
       SELECT rc.player_id, COUNT(*)::int AS red_cards
       FROM red_cards rc JOIN matches m ON m.id = rc.match_id
       WHERE m.league_id = $1
       GROUP BY rc.player_id
     ), foul_totals AS (
       SELECT f.player_id, COUNT(*)::int AS fouls
       FROM fouls f JOIN matches m ON m.id = f.match_id
       WHERE m.league_id = $1
       GROUP BY f.player_id
     ), performance_totals AS (
       SELECT pms.player_id,
         COUNT(*)::int AS appearances,
         SUM(pms.minutes_played)::int AS minutes,
         SUM(pms.shots)::int AS shots,
         SUM(pms.shots_on_target)::int AS shots_on_target,
         SUM(pms.xg)::numeric(7, 2) AS xg,
         SUM(pms.key_passes)::int AS key_passes,
         SUM(pms.tackles)::int AS tackles
       FROM player_match_stats pms
       JOIN matches m ON m.id = pms.match_id
       WHERE m.league_id = $1
       GROUP BY pms.player_id
     ), totals AS (
       SELECT p.id AS player_id, p.club_id,
         COALESCE(gt.goals, 0)::int AS goals,
         COALESCE(at.assists, 0)::int AS assists,
         COALESCE(ct.yellow_cards, 0)::int AS yellow_cards,
         COALESCE(rt.red_cards, 0)::int AS red_cards,
         COALESCE(ft.fouls, 0)::int AS fouls,
         COALESCE(pt.appearances, 0)::int AS appearances,
         COALESCE(pt.minutes, 0)::int AS minutes,
         COALESCE(pt.shots, 0)::int AS shots,
         COALESCE(pt.shots_on_target, 0)::int AS shots_on_target,
         COALESCE(pt.xg, 0)::numeric(7, 2) AS xg,
         COALESCE(pt.key_passes, 0)::int AS key_passes,
         COALESCE(pt.tackles, 0)::int AS tackles
       FROM players p
       JOIN clubs c ON c.id = p.club_id
       LEFT JOIN goal_totals gt ON gt.player_id = p.id
       LEFT JOIN assist_totals at ON at.player_id = p.id
       LEFT JOIN card_totals ct ON ct.player_id = p.id
       LEFT JOIN red_card_totals rt ON rt.player_id = p.id
       LEFT JOIN foul_totals ft ON ft.player_id = p.id
       LEFT JOIN performance_totals pt ON pt.player_id = p.id
       WHERE c.league_id = $1
         AND (
           pt.player_id IS NOT NULL OR gt.player_id IS NOT NULL OR at.player_id IS NOT NULL
           OR ct.player_id IS NOT NULL OR rt.player_id IS NOT NULL OR ft.player_id IS NOT NULL
         )
     )
     SELECT RANK() OVER (ORDER BY t.goals DESC)::int AS rank,
       p.id AS player_id, p.name AS player_name, c.id AS club_id,
       c.name AS club_name, c.short_name, t.goals, t.assists, t.yellow_cards,
       t.red_cards, t.fouls, t.appearances, t.minutes, t.shots,
       t.shots_on_target, t.xg, t.key_passes, t.tackles
     FROM totals t
     JOIN players p ON p.id = t.player_id
     JOIN clubs c ON c.id = t.club_id
     ORDER BY t.goals DESC, t.assists DESC, t.yellow_cards DESC, p.name`,
    [leagueId],
  );
  res.json(result.rows);
});
