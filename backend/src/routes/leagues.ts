import { Router } from 'express';
import type { PoolClient } from 'pg';
import { computeTable } from '../lib';
import { pool } from '../db';
import { ApiError } from '../errors';
import { createLeague } from '../services/league';
import { findNextMatchday, simulateMatchday } from '../services/simulation';
import { withTransaction } from '../services/transaction';
import { createLeagueSchema, forecastSchema, parseId } from '../validation';
import { runForecastInWorker } from '../workers/forecast';

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
      'UPDATE matches SET home_goals = NULL, away_goals = NULL, played_at = NULL WHERE league_id = $1',
      [leagueId],
    );
  });
  res.json({ status: 'reset' });
});

leaguesRouter.get('/leagues/:id/scorers', async (req, res) => {
  const leagueId = parseId(req.params.id);
  await requireLeague(leagueId);
  const result = await pool.query(
    `WITH totals AS (
       SELECT g.player_id, p.club_id, COUNT(*)::int AS goals
       FROM goals g
       JOIN matches m ON m.id = g.match_id
       JOIN players p ON p.id = g.player_id
       WHERE m.league_id = $1
       GROUP BY g.player_id, p.club_id
     )
     SELECT RANK() OVER (ORDER BY t.goals DESC)::int AS rank,
       p.id AS player_id, p.name AS player_name, c.id AS club_id,
       c.name AS club_name, c.short_name, t.goals
     FROM totals t
     JOIN players p ON p.id = t.player_id
     JOIN clubs c ON c.id = t.club_id
     ORDER BY rank, p.name`,
    [leagueId],
  );
  res.json(result.rows);
});

leaguesRouter.get('/leagues/:id/progression', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const league = await requireLeague(leagueId);
  const matchdays = await pool.query<{ matchday: number }>(
    'SELECT DISTINCT matchday FROM matches WHERE league_id = $1 ORDER BY matchday',
    [leagueId],
  );
  const positions = await Promise.all(matchdays.rows.map(async ({ matchday }) => ({
    matchday,
    positions: (await tableForLeague(league, matchday)).map((row) => ({
      club_id: row.club_id,
      position: row.position,
    })),
  })));
  res.json(positions);
});

leaguesRouter.post('/leagues/:id/forecast', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const parsed = forecastSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Invalid forecast settings', 400);
  }
  const league = await requireLeague(leagueId);
  const [clubsResult, matchesResult] = await Promise.all([
    pool.query(
      'SELECT id, name, attack, defence FROM clubs WHERE league_id = $1 ORDER BY id',
      [leagueId],
    ),
    pool.query(
      `SELECT matchday, home_club_id, away_club_id, home_goals, away_goals
       FROM matches WHERE league_id = $1 ORDER BY matchday, id`,
      [leagueId],
    ),
  ]);
  const clubs = clubsResult.rows.map((club) => ({
    id: club.id,
    name: club.name,
    attack: club.attack,
    defence: club.defence,
  }));
  const results = matchesResult.rows.filter((match) => match.home_goals !== null).map((match) => ({
    matchday: match.matchday,
    homeClubId: match.home_club_id,
    awayClubId: match.away_club_id,
    homeGoals: match.home_goals,
    awayGoals: match.away_goals,
  }));
  const remainingFixtures = matchesResult.rows
    .filter((match) => match.home_goals === null)
    .map((match) => ({
      matchday: match.matchday,
      homeClubId: match.home_club_id,
      awayClubId: match.away_club_id,
    }));
  const durationStart = performance.now();
  const forecast = await runForecastInWorker({
    clubs,
    results,
    remainingFixtures,
    rules: { pointsWin: league.points_win, pointsDraw: league.points_draw },
    runs: parsed.data.runs,
    seed: parsed.data.seed ?? 1,
    topZone: league.top_zone,
    bottomZone: league.bottom_zone,
  });
  const duration_ms = Math.round(performance.now() - durationStart);
  res.json({
    results: forecast.map((row) => ({
      club_id: row.clubId,
      positions: row.positionProbabilities,
      title_probability: row.titleProbability,
      top_zone_probability: row.topZoneProbability,
      bottom_zone_probability: row.bottomZoneProbability,
    })),
    duration_ms,
  });
});
