import { Router } from 'express';
import { pool } from '../db';
import { ApiError } from '../errors';
import { matchRowSelect } from '../lib/matchRowSelect';
import { isEventRevealed, matchClockAt } from '../lib/matchClock';
import { subscribeToLeague } from '../services/liveStream';
import { parseId } from '../validation';

export const matchesRouter = Router();

matchesRouter.get('/leagues/:id/live/stream', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const league = await pool.query('SELECT id FROM leagues WHERE id = $1', [leagueId]);
  if (!league.rowCount) throw new ApiError('League not found', 404);
  const lastEventId = req.get('Last-Event-ID') ?? '0';
  res.status(200);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  res.flushHeaders();
  const sendClock = (payload: { now: string }) => {
    const eventId = Date.now();
    res.write(`id: ${eventId}\nevent: clock\ndata: ${JSON.stringify({ ...payload, resumeAfter: lastEventId })}\n\n`);
  };
  sendClock({ now: new Date().toISOString() });
  const unsubscribe = subscribeToLeague(leagueId, sendClock);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

interface MatchEventRow {
  id: number;
  seq: number;
  type: string;
  club_id: number | null;
  player_id: number | null;
  player_name: string | null;
  secondary_player_id: number | null;
  secondary_player_name: string | null;
  payload: Record<string, number | string | boolean | null>;
  minute: number;
  minute_extra: number;
  commentary: string | null;
}

function deriveLiveTeamStats(match: { home_club_id: number; away_club_id: number }, events: MatchEventRow[]) {
  return [match.home_club_id, match.away_club_id].map((clubId) => {
    const chances = events.filter((event) => event.type === 'chance' && event.club_id === clubId);
    const goals = events.filter((event) => event.type === 'goal' && event.club_id === clubId).length;
    const savesAgainst = events.filter((event) => event.type === 'save' && Number(event.payload.attacking_club_id) === clubId).length;
    return {
      club_id: clubId,
      possession: 0,
      shots: chances.length,
      shots_on_target: goals + savesAgainst,
      corners: events.filter((event) => event.type === 'corner' && event.club_id === clubId).length,
      fouls: events.filter((event) => event.type === 'foul' && event.club_id === clubId).length,
      saves: events.filter((event) => event.type === 'save' && event.club_id === clubId).length,
      xg: chances.reduce((total, event) => total + Number(event.payload.xg ?? 0), 0).toFixed(3),
    };
  });
}

matchesRouter.get('/leagues/:id/live', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const league = await pool.query('SELECT id FROM leagues WHERE id = $1', [leagueId]);
  if (!league.rowCount) throw new ApiError('League not found', 404);
  const result = await pool.query(
    `SELECT ${matchRowSelect}
     FROM matches m JOIN clubs h ON h.id = m.home_club_id JOIN clubs a ON a.id = m.away_club_id
     WHERE m.league_id = $1 AND m.status = 'live'
     ORDER BY m.matchday, m.id`,
    [leagueId],
  );
  if (!result.rows.length) return res.json({ status: 'idle', matchday: null, matches: [] });
  const ids = result.rows.map((match) => match.id);
  const eventsResult = await pool.query<MatchEventRow & { match_id: number }>(
    `SELECT e.match_id, e.id, e.seq, e.type, e.club_id, e.player_id, p.name AS player_name,
       e.secondary_player_id, secondary.name AS secondary_player_name,
       e.payload, e.minute, e.minute_extra, e.commentary
     FROM match_events e
     LEFT JOIN players p ON p.id = e.player_id
     LEFT JOIN players secondary ON secondary.id = e.secondary_player_id
     WHERE e.match_id = ANY($1::int[]) ORDER BY e.match_id, e.seq`,
    [ids],
  );
  const eventsByMatch = new Map<number, MatchEventRow[]>();
  for (const event of eventsResult.rows) {
    eventsByMatch.set(event.match_id, [...(eventsByMatch.get(event.match_id) ?? []), event]);
  }
  const matches = result.rows.map((match) => {
    const allEvents = eventsByMatch.get(match.id) ?? [];
    const firstExtra = Math.max(0, ...allEvents.filter((event) => event.minute === 45).map((event) => event.minute_extra));
    const secondExtra = Math.max(0, ...allEvents.filter((event) => event.minute === 90).map((event) => event.minute_extra));
    const clock = matchClockAt(match.kickoff_at, match.duration_seconds, new Date(), firstExtra, secondExtra);
    const events = allEvents.filter((event) => isEventRevealed(event, clock));
    return {
      ...match,
      home_goals: events.filter((event) => event.type === 'goal' && event.club_id === match.home_club_id).length,
      away_goals: events.filter((event) => event.type === 'goal' && event.club_id === match.away_club_id).length,
      minute: clock.minute,
      minute_extra: clock.minuteExtra,
      period: clock.period,
      last_event: events[events.length - 1] ?? null,
    };
  });
  res.json({ status: 'live', matchday: result.rows[0].matchday, matches });
});

matchesRouter.get('/leagues/:id/matches', async (req, res) => {
  const leagueId = parseId(req.params.id);
  const league = await pool.query('SELECT id FROM leagues WHERE id = $1', [leagueId]);
  if (league.rowCount === 0) throw new ApiError('League not found', 404);

  let matchday: number | undefined;
  if (req.query.matchday !== undefined) {
    const value = req.query.matchday;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new ApiError('Matchday must be a positive integer', 400);
    }
    matchday = Number(value);
  }

  const result = await pool.query(
    `SELECT ${matchRowSelect},
       COALESCE(events.match_events, '[]'::json) AS match_events,
       COALESCE(events.first_half_extra, 0)::int AS first_half_extra,
       COALESCE(events.second_half_extra, 0)::int AS second_half_extra
     FROM matches m
     JOIN clubs h ON h.id = m.home_club_id
     JOIN clubs a ON a.id = m.away_club_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
         'id', e.id, 'seq', e.seq, 'type', e.type,
         'club_id', e.club_id,
         'player_id', e.player_id,
         'player_name', p.name,
         'secondary_player_id', e.secondary_player_id,
         'secondary_player_name', ap.name,
         'minute', e.minute, 'minute_extra', e.minute_extra,
         'payload', e.payload, 'commentary', e.commentary
       ) ORDER BY e.seq) AS match_events,
       COALESCE(MAX(e.minute_extra) FILTER (WHERE e.minute = 45), 0)::int AS first_half_extra,
       COALESCE(MAX(e.minute_extra) FILTER (WHERE e.minute = 90), 0)::int AS second_half_extra
       FROM match_events e
       LEFT JOIN players p ON p.id = e.player_id
       LEFT JOIN players ap ON ap.id = e.secondary_player_id
       WHERE e.match_id = m.id
     ) events ON TRUE
     WHERE m.league_id = $1 AND ($2::int IS NULL OR m.matchday = $2)
     ORDER BY m.matchday, m.id`,
    [leagueId, matchday ?? null],
  );
  const rows = result.rows.map((row) => {
    const allEvents = row.match_events as MatchEventRow[];
    const publicMatch = { ...row };
    delete publicMatch.match_events;
    delete publicMatch.first_half_extra;
    delete publicMatch.second_half_extra;
    const clock = row.status === 'live'
      ? matchClockAt(row.kickoff_at, row.duration_seconds, new Date(), row.first_half_extra, row.second_half_extra)
      : null;
    const visibleEvents = row.status === 'scheduled' ? []
      : clock ? allEvents.filter((event) => isEventRevealed(event, clock)) : allEvents;
    const goalEvents = visibleEvents.filter((event) => event.type === 'goal');
    const homeGoals = goalEvents.filter((event) => String(event.club_id) === String(row.home_club_id)).length;
    const awayGoals = goalEvents.filter((event) => String(event.club_id) === String(row.away_club_id)).length;
    const homeXg = visibleEvents.filter((event) => event.type === 'chance' && String(event.club_id) === String(row.home_club_id))
      .reduce((sum, event) => sum + Number(event.payload?.xg ?? 0), 0);
    const awayXg = visibleEvents.filter((event) => event.type === 'chance' && String(event.club_id) === String(row.away_club_id))
      .reduce((sum, event) => sum + Number(event.payload?.xg ?? 0), 0);
    return {
      ...publicMatch,
      home_goals: row.status === 'live' ? homeGoals : row.home_goals,
      away_goals: row.status === 'live' ? awayGoals : row.away_goals,
      home_xg: row.status === 'live' ? homeXg.toFixed(3) : row.home_xg,
      away_xg: row.status === 'live' ? awayXg.toFixed(3) : row.away_xg,
      minute: clock?.minute ?? null,
      minute_extra: clock?.minuteExtra ?? null,
      period: clock?.period ?? null,
      goal_events: goalEvents.map((event) => ({
        club_id: event.club_id, player_name: event.player_name,
        assist_player_name: event.secondary_player_name, minute: event.minute,
        minute_extra: event.minute_extra,
      })),
      yellow_card_count: visibleEvents.filter((event) => event.type === 'yellow').length,
      red_card_count: visibleEvents.filter((event) => event.type === 'red').length,
    };
  });
  res.json(rows);
});

matchesRouter.get('/matches/:id/live', async (req, res) => {
  const id = parseId(req.params.id);
  const afterValue = req.query.after ?? '0';
  if (typeof afterValue !== 'string' || !/^\d+$/.test(afterValue) || !Number.isSafeInteger(Number(afterValue))) {
    throw new ApiError('Event cursor must be a non-negative integer', 400);
  }
  const matchResult = await pool.query(
    `SELECT id, league_id, status, kickoff_at, duration_seconds, home_club_id, away_club_id,
       home_goals, away_goals
     FROM matches WHERE id = $1`, [id],
  );
  const match = matchResult.rows[0];
  if (!match) throw new ApiError('Match not found', 404);
  const eventsResult = await pool.query<MatchEventRow>(
    `SELECT e.id, e.seq, e.type, e.club_id, e.player_id, p.name AS player_name,
       e.secondary_player_id, secondary.name AS secondary_player_name,
       e.payload, e.minute, e.minute_extra, e.commentary
     FROM match_events e
     LEFT JOIN players p ON p.id = e.player_id
     LEFT JOIN players secondary ON secondary.id = e.secondary_player_id
     WHERE e.match_id = $1 AND e.seq > $2 ORDER BY e.seq`, [id, Number(afterValue)],
  );
  const extrasResult = await pool.query<{ first_half_extra: number; second_half_extra: number }>(
    `SELECT COALESCE(MAX(minute_extra) FILTER (WHERE minute = 45), 0)::int AS first_half_extra,
       COALESCE(MAX(minute_extra) FILTER (WHERE minute = 90), 0)::int AS second_half_extra
     FROM match_events WHERE match_id = $1`, [id],
  );
  const extras = extrasResult.rows[0];
  const clock = match.status === 'live'
    ? matchClockAt(match.kickoff_at, match.duration_seconds, new Date(), extras.first_half_extra, extras.second_half_extra)
    : null;
  const events = match.status === 'scheduled' ? [] : eventsResult.rows.filter((event) => !clock || isEventRevealed(event, clock));
  const goalResult = await pool.query<Pick<MatchEventRow, 'club_id' | 'minute' | 'minute_extra' | 'type'>>(
    `SELECT club_id, minute, minute_extra, type FROM match_events WHERE match_id = $1 AND type = 'goal'`, [id],
  );
  const visibleGoals = goalResult.rows.filter((event) => !clock || isEventRevealed(event, clock));
  res.json({
    now: new Date().toISOString(), status: match.status,
    minute: clock?.minute ?? (match.status === 'finished' ? 90 : 0),
    minute_extra: clock?.minuteExtra ?? 0, period: clock?.period ?? match.status,
    home_goals: match.status === 'live' ? visibleGoals.filter((event) => event.club_id === match.home_club_id).length : match.home_goals,
    away_goals: match.status === 'live' ? visibleGoals.filter((event) => event.club_id === match.away_club_id).length : match.away_goals,
    events,
  });
});

matchesRouter.get('/matches/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const result = await pool.query(
    `SELECT ${matchRowSelect}
     FROM matches m
     JOIN clubs h ON h.id = m.home_club_id
     JOIN clubs a ON a.id = m.away_club_id
     WHERE m.id = $1`,
    [id],
  );
  const match = result.rows[0];
  if (!match) throw new ApiError('Match not found', 404);

  const [events, teamStats, playerStats, lineups] = await Promise.all([
    pool.query(
      `SELECT e.id, e.seq, e.type, e.club_id, e.player_id, p.name AS player_name,
         e.secondary_player_id, secondary.name AS secondary_player_name,
         e.payload, e.minute, e.minute_extra
       FROM match_events e
       LEFT JOIN players p ON p.id = e.player_id
       LEFT JOIN players secondary ON secondary.id = e.secondary_player_id
       WHERE e.match_id = $1
       ORDER BY e.seq`,
      [id],
    ),
    pool.query(
      `SELECT s.club_id, s.possession, s.shots, s.shots_on_target, s.corners,
         s.fouls, s.saves,
         CASE WHEN s.club_id = m.home_club_id THEN m.home_xg ELSE m.away_xg END AS xg
       FROM match_team_stats s
       JOIN matches m ON m.id = s.match_id
       WHERE s.match_id = $1`,
      [id],
    ),
    pool.query(
      `SELECT pms.club_id, pms.player_id, p.name AS player_name, p.position, pms.is_starter,
         pms.minutes_played, pms.shots, pms.shots_on_target, pms.xg,
         pms.key_passes, pms.tackles,
         (SELECT COUNT(*)::int FROM match_events e WHERE e.match_id = pms.match_id AND e.player_id = pms.player_id AND e.type = 'goal') AS goals,
         (SELECT COUNT(*)::int FROM match_events e WHERE e.match_id = pms.match_id AND e.secondary_player_id = pms.player_id AND e.type = 'goal') AS assists,
         (SELECT COUNT(*)::int FROM match_events e WHERE e.match_id = pms.match_id AND e.player_id = pms.player_id AND e.type = 'yellow') AS yellow_cards,
         (SELECT COUNT(*)::int FROM match_events e WHERE e.match_id = pms.match_id AND e.player_id = pms.player_id AND e.type = 'red') AS red_cards,
         (SELECT COUNT(*)::int FROM match_events e WHERE e.match_id = pms.match_id AND e.player_id = pms.player_id AND e.type = 'foul') AS fouls
       FROM player_match_stats pms
       JOIN players p ON p.id = pms.player_id
       WHERE pms.match_id = $1
       ORDER BY p.position, p.name`,
      [id],
    ),
    pool.query(
      `SELECT (entry.player_stat->>'clubId')::int AS club_id, p.id AS player_id, p.name AS player_name,
         p.position, COALESCE((entry.player_stat->>'isStarter')::boolean, false) AS is_starter
       FROM matches m
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.simulation_result->'playerStats', '[]'::jsonb)) AS entry(player_stat)
       JOIN players p ON p.id = (entry.player_stat->>'playerId')::int
       WHERE m.id = $1
       AND p.club_id = (entry.player_stat->>'clubId')::int
       ORDER BY p.position, p.name`,
      [id],
    ),
  ]);
  const allEvents = events.rows as MatchEventRow[];
  const firstExtra = Math.max(0, ...allEvents.filter((event) => event.minute === 45).map((event) => event.minute_extra));
  const secondExtra = Math.max(0, ...allEvents.filter((event) => event.minute === 90).map((event) => event.minute_extra));
  const clock = match.status === 'live'
    ? matchClockAt(match.kickoff_at, match.duration_seconds, new Date(), firstExtra, secondExtra)
    : null;
  const revealedEvents = match.status === 'scheduled' ? []
    : clock ? allEvents.filter((event) => isEventRevealed(event, clock)) : allEvents;
  const goals = revealedEvents.filter((event) => event.type === 'goal').map((event) => ({
    id: event.id, club_id: event.club_id, player_id: event.player_id, player_name: event.player_name,
    assist_player_id: event.secondary_player_id, assist_player_name: event.secondary_player_name,
    minute: event.minute, minute_extra: event.minute_extra,
  }));
  const yellowCards = revealedEvents.filter((event) => event.type === 'yellow').map((event) => event);
  const redCards = revealedEvents.filter((event) => event.type === 'red').map((event) => event);
  const fouls = revealedEvents.filter((event) => event.type === 'foul').map((event) => event);
  const substitutions = revealedEvents.filter((event) => event.type === 'substitution').map((event) => ({
    id: event.id, club_id: event.club_id, player_on_id: event.player_id,
    player_on_name: event.player_name, player_off_id: event.secondary_player_id,
    player_off_name: event.secondary_player_name, minute: event.minute,
  }));
  const homeGoals = goals.filter((goal) => String(goal.club_id) === String(match.home_club_id)).length;
  const awayGoals = goals.filter((goal) => String(goal.club_id) === String(match.away_club_id)).length;
  const homeXg = revealedEvents.filter((event) => event.type === 'chance' && String(event.club_id) === String(match.home_club_id))
    .reduce((sum, event) => sum + Number(event.payload?.xg ?? 0), 0);
  const awayXg = revealedEvents.filter((event) => event.type === 'chance' && String(event.club_id) === String(match.away_club_id))
    .reduce((sum, event) => sum + Number(event.payload?.xg ?? 0), 0);
  res.json({
    ...match,
    home_goals: match.status === 'live' ? homeGoals : match.home_goals,
    away_goals: match.status === 'live' ? awayGoals : match.away_goals,
    home_xg: match.status === 'live' ? homeXg.toFixed(3) : match.home_xg,
    away_xg: match.status === 'live' ? awayXg.toFixed(3) : match.away_xg,
    clock: clock ? { minute: clock.minute, minute_extra: clock.minuteExtra, period: clock.period } : null,
    events: revealedEvents,
    goals,
    yellow_cards: yellowCards,
    red_cards: redCards,
    fouls,
    substitutions,
    team_stats: match.status === 'live' ? deriveLiveTeamStats(match, revealedEvents) : teamStats.rows,
    player_stats: playerStats.rows,
    lineups: lineups.rows,
  });
});
