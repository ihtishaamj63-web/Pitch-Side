import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { computeTable } from '../lib';
import { HALF_TIME_PAUSE_SECONDS, isEventRevealed, matchClockAt } from '../lib/matchClock';
import { pool } from '../db';
import { ApiError } from '../errors';
import { createLeague } from '../services/league';
import { findNextMatchday, finalizeElapsedMatches, simulateMatchday } from '../services/simulation';
import { withTransaction } from '../services/transaction';
import { createLeagueSchema, kickoffSchema, parseId, simulateNextSchema } from '../validation';

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

function liveDurationSeconds(speed: 'quick' | 'standard' | 'extended'): number {
  const defaults = { quick: 90, standard: 900, extended: 3600 };
  const configured = Number(process.env[`LIVE_SPEED_${speed.toUpperCase()}_SECONDS`]);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : defaults[speed];
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
      `SELECT id, matchday, home_club_id, away_club_id, home_goals, away_goals, played_at,
         status, kickoff_at, duration_seconds
       FROM matches
       WHERE league_id = $1 AND (home_goals IS NOT NULL OR status = 'live')
         AND ($2::int IS NULL OR matchday <= $2)
       ORDER BY matchday, id`,
      [league.id, upToMatchday ?? null],
    ),
  ]);

  const liveMatchIds = matchesResult.rows.filter((match) => match.status === 'live').map((match) => match.id);
  const liveEvents = liveMatchIds.length
    ? await pool.query(
      `SELECT match_id, seq, type, club_id, minute, minute_extra, payload
       FROM match_events WHERE match_id = ANY($1::int[]) ORDER BY match_id, seq`,
      [liveMatchIds],
    )
    : { rows: [] as Array<{ match_id: number; seq: number; type: string; club_id: number | null; minute: number; minute_extra: number; payload: Record<string, unknown> }> };
  const eventsByMatch = new Map<number, typeof liveEvents.rows>();
  liveEvents.rows.forEach((event) => eventsByMatch.set(event.match_id, [...(eventsByMatch.get(event.match_id) ?? []), event]));
  const liveClubIds = new Set<number>();
  const matchesForTable = matchesResult.rows.map((match) => {
    if (match.status !== 'live') return match;
    liveClubIds.add(Number(match.home_club_id));
    liveClubIds.add(Number(match.away_club_id));
    const events = eventsByMatch.get(match.id) ?? [];
    const firstExtra = Math.max(0, ...events.filter((event) => event.minute === 45).map((event) => event.minute_extra));
    const secondExtra = Math.max(0, ...events.filter((event) => event.minute === 90).map((event) => event.minute_extra));
    const clock = matchClockAt(match.kickoff_at, match.duration_seconds, new Date(), firstExtra, secondExtra);
    const revealed = events.filter((event) => isEventRevealed(event, clock));
    return {
      ...match,
      home_goals: revealed.filter((event) => event.type === 'goal' && Number(event.club_id) === Number(match.home_club_id)).length,
      away_goals: revealed.filter((event) => event.type === 'goal' && Number(event.club_id) === Number(match.away_club_id)).length,
    };
  });

  const clubs = clubsResult.rows.map((club) => ({
    id: club.id,
    name: club.name,
    attack: club.attack,
    defence: club.defence,
  }));
  const playedMatches = matchesForTable.map((match) => ({
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
  const latestMatchday = upToMatchday ?? Math.max(0, ...matchesForTable.map((match) => match.matchday));
  const previousTable = latestMatchday > 0
    ? computeTable(
      clubs,
      matchesForTable
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
      live: liveClubIds.has(Number(row.clubId)),
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

leaguesRouter.get('/leagues/:id/table/history', async (req, res) => {
  const id = parseId(req.params.id);
  const league = await requireLeague(id);
  const [clubsResult, matchesResult] = await Promise.all([
    pool.query('SELECT id, name, attack, defence FROM clubs WHERE league_id = $1 ORDER BY id', [id]),
    pool.query(
      `SELECT matchday, home_club_id, away_club_id, home_goals, away_goals
       FROM matches WHERE league_id = $1 AND status = 'finished' ORDER BY matchday, id`, [id],
    ),
  ]);
  const clubs = clubsResult.rows.map((club) => ({ id: club.id, name: club.name, attack: club.attack, defence: club.defence }));
  const matchdays = Math.max(0, ...matchesResult.rows.map((match) => match.matchday));
  const history = Array.from({ length: matchdays }, (_, index) => {
    const matchday = index + 1;
    const completed = matchesResult.rows.filter((match) => match.matchday <= matchday).map((match) => ({
      matchday: match.matchday, homeClubId: match.home_club_id, awayClubId: match.away_club_id,
      homeGoals: match.home_goals, awayGoals: match.away_goals,
    }));
    return {
      matchday,
      positions: computeTable(clubs, completed, { pointsWin: league.points_win, pointsDraw: league.points_draw })
        .map((row) => ({ club_id: row.clubId, club_name: row.clubName, position: row.position })),
    };
  });
  res.json(history);
});

leaguesRouter.post('/leagues/:id/simulate/next', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const parsed = simulateNextSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Invalid simulate body', 400);
  }
  const managerChoices = parsed.data.managerClubId !== undefined && parsed.data.tactics !== undefined
    ? { clubId: parsed.data.managerClubId, tactics: parsed.data.tactics }
    : undefined;
  const result = await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    const activeMatchday = await client.query('SELECT 1 FROM matches WHERE league_id = $1 AND status = \'live\' LIMIT 1', [leagueId]);
    if (activeMatchday.rowCount) throw new ApiError('The current matchday is live.', 409);
    if (managerChoices) {
      const club = await client.query(
        'SELECT 1 FROM clubs WHERE id = $1 AND league_id = $2',
        [managerChoices.clubId, leagueId],
      );
      if (club.rowCount === 0) throw new ApiError('Manager club not found in this league', 400);
    }
    const matchday = await findNextMatchday(client, leagueId);
    if (matchday === null) throw new ApiError('Season is already finished', 409);
    const simulation = await simulateMatchday(client, leagueId, matchday, managerChoices);
    return { matchday, ...simulation };
  });
  const { managerMatch, ...response } = result;
  res.json(managerChoices ? { ...response, managerMatch } : response);
});

leaguesRouter.post('/leagues/:id/simulate/all', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const result = await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    const activeMatchday = await client.query('SELECT 1 FROM matches WHERE league_id = $1 AND status = \'live\' LIMIT 1', [leagueId]);
    if (activeMatchday.rowCount) throw new ApiError('Finish the live matchday before simulating the season.', 409);
    let matchdaysPlayed = 0;
    let matchesPlayed = 0;
    let matchday = await findNextMatchday(client, leagueId);
    while (matchday !== null) {
      matchesPlayed += (await simulateMatchday(client, leagueId, matchday)).matchesPlayed;
      matchdaysPlayed += 1;
      matchday = await findNextMatchday(client, leagueId);
    }
    return { matchdaysPlayed, matchesPlayed };
  });
  res.json(result);
});

leaguesRouter.post('/leagues/:id/matchdays/:matchday/kickoff', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const matchday = readMatchday(req.params.matchday);
  if (matchday === undefined) throw new ApiError('Matchday must be a positive integer', 400);
  const parsed = kickoffSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Invalid kick-off request', 400);
  const managerChoices = parsed.data.managerClubId !== undefined && parsed.data.tactics !== undefined
    ? { clubId: parsed.data.managerClubId, tactics: parsed.data.tactics }
    : undefined;
  const result = await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    const liveRound = await client.query('SELECT 1 FROM matches WHERE league_id = $1 AND status = \'live\' LIMIT 1', [leagueId]);
    if (liveRound.rowCount) throw new ApiError('Finish the live matchday before starting another.', 409);
    if (managerChoices) {
      const club = await client.query(
        'SELECT 1 FROM clubs WHERE id = $1 AND league_id = $2',
        [managerChoices.clubId, leagueId],
      );
      if (!club.rowCount) throw new ApiError('Manager club not found in this league', 400);
    }
    const scheduled = await client.query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'scheduled' AND home_goals IS NULL)::int AS pending
       FROM matches WHERE league_id = $1 AND matchday = $2`,
      [leagueId, matchday],
    );
    const fixtureCount = scheduled.rows[0]?.total ?? 0;
    if (fixtureCount === 0) throw new ApiError('Matchday not found', 404);
    if (scheduled.rows[0].pending !== fixtureCount) throw new ApiError('This matchday is already underway or complete.', 409);

    if (parsed.data.speed === 'instant') {
      const simulation = await simulateMatchday(client, leagueId, matchday, managerChoices);
      return { matchday, matchesFinished: simulation.matchesPlayed, status: 'finished' };
    }
    const kickoffAt = new Date();
    const simulation = await simulateMatchday(client, leagueId, matchday, managerChoices, {
      live: true,
      kickoffAt,
      durationSeconds: liveDurationSeconds(parsed.data.speed),
    });
    return {
      matchday,
      matchesStarted: simulation.matchesPlayed,
      kickoffAt: kickoffAt.toISOString(),
      durationSeconds: liveDurationSeconds(parsed.data.speed),
      status: 'live',
    };
  });
  res.status(202).json(result);
});

leaguesRouter.post('/leagues/:id/reset', async (req, res) => {
  const leagueId = parseId(req.params.id);
  await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    for (const table of ['match_events', 'match_team_stats', 'player_match_stats']) {
      await client.query(
        `DELETE FROM ${table} WHERE match_id IN (SELECT id FROM matches WHERE league_id = $1)`,
        [leagueId],
      );
    }
    await client.query(
      `UPDATE matches SET home_goals = NULL, away_goals = NULL, home_xg = NULL,
         away_xg = NULL, played_at = NULL, status = 'scheduled', kickoff_at = NULL,
         simulation_result = NULL
       WHERE league_id = $1`,
      [leagueId],
    );
  });
  res.json({ status: 'reset' });
});

leaguesRouter.post('/leagues/:id/live/skip', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const finished = await withTransaction(async (client) => {
    await lockLeague(client, leagueId);
    await client.query(
      `UPDATE matches SET kickoff_at = NOW() - make_interval(secs => duration_seconds + $1)
       WHERE league_id = $2 AND status = 'live'`,
      [HALF_TIME_PAUSE_SECONDS, leagueId],
    );
    return finalizeElapsedMatches(client);
  });
  res.json({ status: 'finished', matchesFinished: finished });
});

const playerStatsHandler = async (req: Request<{ id: string }>, res: Response) => {
  const leagueId = parseId(req.params.id);
  const upToMatchday = readMatchday(req.query.upToMatchday);
  await requireLeague(leagueId);
  const result = await pool.query(
    `WITH event_people AS (
       SELECT e.player_id, e.type, m.league_id, m.matchday
       FROM match_events e JOIN matches m ON m.id = e.match_id
       WHERE m.status = 'finished'
       UNION ALL
       SELECT e.secondary_player_id AS player_id, 'assist' AS type, m.league_id, m.matchday
       FROM match_events e JOIN matches m ON m.id = e.match_id
       WHERE m.status = 'finished' AND e.type = 'goal' AND e.secondary_player_id IS NOT NULL
     ), event_totals AS (
       SELECT player_id,
         COUNT(*) FILTER (WHERE type = 'goal')::int AS goals,
         COUNT(*) FILTER (WHERE type = 'assist')::int AS assists,
         COUNT(*) FILTER (WHERE type = 'yellow')::int AS yellow_cards,
         COUNT(*) FILTER (WHERE type = 'red')::int AS red_cards,
         COUNT(*) FILTER (WHERE type = 'foul')::int AS fouls
       FROM event_people
       WHERE league_id = $1 AND ($2::int IS NULL OR matchday <= $2)
       GROUP BY player_id
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
       WHERE m.league_id = $1 AND m.status = 'finished'
         AND ($2::int IS NULL OR m.matchday <= $2)
       GROUP BY pms.player_id
     ), totals AS (
       SELECT p.id AS player_id, p.club_id,
         COALESCE(et.goals, 0)::int AS goals,
         COALESCE(et.assists, 0)::int AS assists,
         COALESCE(et.yellow_cards, 0)::int AS yellow_cards,
         COALESCE(et.red_cards, 0)::int AS red_cards,
         COALESCE(et.fouls, 0)::int AS fouls,
         COALESCE(pt.appearances, 0)::int AS appearances,
         COALESCE(pt.minutes, 0)::int AS minutes,
         COALESCE(pt.shots, 0)::int AS shots,
         COALESCE(pt.shots_on_target, 0)::int AS shots_on_target,
         COALESCE(pt.xg, 0)::numeric(7, 2) AS xg,
         COALESCE(pt.key_passes, 0)::int AS key_passes,
         COALESCE(pt.tackles, 0)::int AS tackles
       FROM players p
       JOIN clubs c ON c.id = p.club_id
       LEFT JOIN event_totals et ON et.player_id = p.id
       LEFT JOIN performance_totals pt ON pt.player_id = p.id
       WHERE c.league_id = $1
         AND (
           pt.player_id IS NOT NULL OR et.player_id IS NOT NULL
         )
     )
     SELECT RANK() OVER (ORDER BY t.goals DESC)::int AS rank,
       p.id AS player_id, p.name AS player_name, p.position, c.id AS club_id,
       c.name AS club_name, c.short_name, t.goals, t.assists, t.yellow_cards,
       t.red_cards, t.fouls, t.appearances, t.minutes, t.shots,
       t.shots_on_target, t.xg, t.key_passes, t.tackles
     FROM totals t
     JOIN players p ON p.id = t.player_id
     JOIN clubs c ON c.id = t.club_id
     ORDER BY t.goals DESC, t.assists DESC, t.yellow_cards DESC, p.name`,
    [leagueId, upToMatchday ?? null],
  );
  res.json(result.rows);
};

leaguesRouter.get(['/leagues/:id/player-stats', '/leagues/:id/scorers'], playerStatsHandler);
