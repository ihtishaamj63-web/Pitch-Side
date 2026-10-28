import { Router } from 'express';
import { pool } from '../db';
import { ApiError } from '../errors';
import { parseId } from '../validation';

export const playersRouter = Router();

playersRouter.get('/players/:id', async (req, res) => {
  const playerId = parseId(req.params.id);
  const playerResult = await pool.query(
    `SELECT p.id, p.name, p.position, c.id AS club_id, c.name AS club_name,
       c.short_name, c.colour_primary, c.colour_secondary, l.id AS league_id,
       l.name AS league_name, l.season_label
     FROM players p
     JOIN clubs c ON c.id = p.club_id
     JOIN leagues l ON l.id = c.league_id
     WHERE p.id = $1`,
    [playerId],
  );
  const player = playerResult.rows[0];
  if (!player) throw new ApiError('Player not found', 404);

  const matches = await pool.query(
    `SELECT m.id, m.matchday, m.home_goals, m.away_goals,
       h.id AS home_club_id, h.name AS home_club_name,
       a.id AS away_club_id, a.name AS away_club_name,
       pms.minutes_played, pms.shots, pms.shots_on_target, pms.xg,
       pms.key_passes, pms.tackles,
       (SELECT COUNT(*)::int FROM match_events e WHERE e.match_id = m.id AND e.player_id = $1 AND e.type = 'goal') AS goals,
       (SELECT COUNT(*)::int FROM match_events e WHERE e.match_id = m.id AND e.secondary_player_id = $1 AND e.type = 'goal') AS assists,
       COALESCE((SELECT json_agg(json_build_object('minute', e.minute, 'minute_extra', e.minute_extra, 'type', e.type) ORDER BY e.seq)
         FROM match_events e WHERE e.match_id = m.id AND e.player_id = $1 AND e.type = 'goal'), '[]'::json) AS goals_timeline
     FROM player_match_stats pms
     JOIN matches m ON m.id = pms.match_id AND m.status = 'finished'
     JOIN clubs h ON h.id = m.home_club_id
     JOIN clubs a ON a.id = m.away_club_id
     WHERE pms.player_id = $1
     ORDER BY m.matchday, m.id`,
    [playerId],
  );
  const log = matches.rows.map((match) => {
    const impact = Number(match.goals) * 4 + Number(match.assists) * 3
      + Number(match.shots_on_target) * 0.5 + Number(match.key_passes) * 0.25
      + Number(match.tackles) * 0.1;
    return { ...match, rating: Math.max(5, Math.min(10, 6 + impact)).toFixed(1) };
  });
  res.json({ player, matches: log });
});
