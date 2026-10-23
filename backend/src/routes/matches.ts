import { Router } from 'express';
import { pool } from '../db';
import { ApiError } from '../errors';
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
    `SELECT m.id, m.matchday, m.home_club_id, m.away_club_id,
       m.home_goals, m.away_goals, m.played_at,
       h.name AS home_name, h.name AS home_club_name, h.short_name AS home_short_name,
       h.colour_primary AS home_colour_primary, h.colour_secondary AS home_colour_secondary,
       a.name AS away_name, a.name AS away_club_name, a.short_name AS away_short_name,
       a.colour_primary AS away_colour_primary, a.colour_secondary AS away_colour_secondary,
       m.home_xg, m.away_xg,
       COALESCE(events.goal_events, '[]'::json) AS goal_events,
       COALESCE(cards.yellow_cards, 0)::int AS yellow_card_count,
       COALESCE(cards.red_cards, 0)::int AS red_card_count
     FROM matches m
     JOIN clubs h ON h.id = m.home_club_id
     JOIN clubs a ON a.id = m.away_club_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
         'club_id', g.club_id,
         'player_name', p.name,
         'assist_player_name', ap.name,
         'minute', g.minute
       ) ORDER BY g.minute, g.id) AS goal_events
       FROM goals g
       JOIN players p ON p.id = g.player_id
       LEFT JOIN players ap ON ap.id = g.assist_player_id
       WHERE g.match_id = m.id
     ) events ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         (SELECT COUNT(*) FROM yellow_cards yc WHERE yc.match_id = m.id)::int AS yellow_cards,
         (SELECT COUNT(*) FROM red_cards rc WHERE rc.match_id = m.id)::int AS red_cards
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
    `SELECT m.id, m.league_id, m.matchday, m.home_club_id, m.away_club_id,
       m.home_goals, m.away_goals, m.played_at,
       m.home_xg, m.away_xg,
       h.name AS home_name, h.name AS home_club_name, h.short_name AS home_short_name,
       h.colour_primary AS home_colour_primary, h.colour_secondary AS home_colour_secondary,
       a.name AS away_name, a.name AS away_club_name, a.short_name AS away_short_name,
       a.colour_primary AS away_colour_primary, a.colour_secondary AS away_colour_secondary
     FROM matches m
     JOIN clubs h ON h.id = m.home_club_id
     JOIN clubs a ON a.id = m.away_club_id
     WHERE m.id = $1`,
    [id],
  );
  const match = result.rows[0];
  if (!match) throw new ApiError('Match not found', 404);

  const [goals, yellowCards, redCards, fouls, teamStats, playerStats] = await Promise.all([
    pool.query(
      `SELECT g.id, g.club_id, g.player_id, p.name AS player_name,
       g.assist_player_id, ap.name AS assist_player_name, g.minute
       FROM goals g
       JOIN players p ON p.id = g.player_id
       LEFT JOIN players ap ON ap.id = g.assist_player_id
       WHERE g.match_id = $1
       ORDER BY g.minute, g.id`,
      [id],
    ),
    pool.query(
      `SELECT yc.id, yc.club_id, yc.player_id, p.name AS player_name, yc.minute
       FROM yellow_cards yc
       JOIN players p ON p.id = yc.player_id
       WHERE yc.match_id = $1
       ORDER BY yc.minute, yc.id`,
      [id],
    ),
    pool.query(
      `SELECT rc.id, rc.club_id, rc.player_id, p.name AS player_name, rc.minute
       FROM red_cards rc
       JOIN players p ON p.id = rc.player_id
       WHERE rc.match_id = $1
       ORDER BY rc.minute, rc.id`,
      [id],
    ),
    pool.query(
      `SELECT f.id, f.club_id, f.player_id, p.name AS player_name, f.minute
       FROM fouls f
       JOIN players p ON p.id = f.player_id
       WHERE f.match_id = $1
       ORDER BY f.minute, f.id`,
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
      `SELECT pms.club_id, pms.player_id, p.name AS player_name, p.position,
         pms.minutes_played, pms.shots, pms.shots_on_target, pms.xg,
         pms.key_passes, pms.tackles,
         (SELECT COUNT(*)::int FROM goals g WHERE g.match_id = pms.match_id AND g.player_id = pms.player_id) AS goals,
         (SELECT COUNT(*)::int FROM goals g WHERE g.match_id = pms.match_id AND g.assist_player_id = pms.player_id) AS assists,
         (SELECT COUNT(*)::int FROM yellow_cards yc WHERE yc.match_id = pms.match_id AND yc.player_id = pms.player_id) AS yellow_cards,
         (SELECT COUNT(*)::int FROM red_cards rc WHERE rc.match_id = pms.match_id AND rc.player_id = pms.player_id) AS red_cards,
         (SELECT COUNT(*)::int FROM fouls f WHERE f.match_id = pms.match_id AND f.player_id = pms.player_id) AS fouls
       FROM player_match_stats pms
       JOIN players p ON p.id = pms.player_id
       WHERE pms.match_id = $1
       ORDER BY p.position, p.name`,
      [id],
    ),
  ]);
  res.json({
    ...match,
    goals: goals.rows,
    yellow_cards: yellowCards.rows,
    red_cards: redCards.rows,
    fouls: fouls.rows,
    team_stats: teamStats.rows,
    player_stats: playerStats.rows,
  });
});
