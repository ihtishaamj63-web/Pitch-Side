import { Router } from 'express';
import { pool } from '../db';
import { ApiError } from '../errors';
import { matchRowSelect } from '../lib/matchRowSelect';
import { parseId } from '../validation';

export const matchesRouter = Router();

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
       COALESCE(events.goal_events, '[]'::json) AS goal_events,
       COALESCE(cards.yellow_cards, 0)::int AS yellow_card_count,
       COALESCE(cards.red_cards, 0)::int AS red_card_count
     FROM matches m
     JOIN clubs h ON h.id = m.home_club_id
     JOIN clubs a ON a.id = m.away_club_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
         'club_id', e.club_id,
         'player_name', p.name,
         'assist_player_name', ap.name,
         'minute', e.minute
       ) ORDER BY e.minute, e.seq) AS goal_events
       FROM match_events e
       JOIN players p ON p.id = e.player_id
       LEFT JOIN players ap ON ap.id = e.secondary_player_id
       WHERE e.match_id = m.id AND e.type = 'goal'
     ) events ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.id AND e.type = 'yellow')::int AS yellow_cards,
         (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.id AND e.type = 'red')::int AS red_cards
     ) cards ON TRUE
     WHERE m.league_id = $1 AND ($2::int IS NULL OR m.matchday = $2)
     ORDER BY m.matchday, m.id`,
    [leagueId, matchday ?? null],
  );
  res.json(result.rows);
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

  const [events, teamStats, playerStats] = await Promise.all([
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
  ]);
  const goals = events.rows.filter((event) => event.type === 'goal').map((event) => ({
    id: event.id, club_id: event.club_id, player_id: event.player_id, player_name: event.player_name,
    assist_player_id: event.secondary_player_id, assist_player_name: event.secondary_player_name,
    minute: event.minute, minute_extra: event.minute_extra,
  }));
  const yellowCards = events.rows.filter((event) => event.type === 'yellow').map((event) => event);
  const redCards = events.rows.filter((event) => event.type === 'red').map((event) => event);
  const fouls = events.rows.filter((event) => event.type === 'foul').map((event) => event);
  const substitutions = events.rows.filter((event) => event.type === 'substitution').map((event) => ({
    id: event.id, club_id: event.club_id, player_on_id: event.player_id,
    player_on_name: event.player_name, player_off_id: event.secondary_player_id,
    player_off_name: event.secondary_player_name, minute: event.minute,
  }));
  res.json({
    ...match,
    goals,
    yellow_cards: yellowCards,
    red_cards: redCards,
    fouls,
    substitutions,
    team_stats: teamStats.rows,
    player_stats: playerStats.rows,
  });
});
