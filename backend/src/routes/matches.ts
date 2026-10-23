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
       a.colour_primary AS away_colour_primary, a.colour_secondary AS away_colour_secondary
     FROM matches m
     JOIN clubs h ON h.id = m.home_club_id
     JOIN clubs a ON a.id = m.away_club_id
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

  const goals = await pool.query(
    `SELECT g.id, g.club_id, g.player_id, p.name AS player_name, g.minute
     FROM goals g
     JOIN players p ON p.id = g.player_id
     WHERE g.match_id = $1
     ORDER BY g.minute, g.id`,
    [id],
  );
  res.json({ ...match, goals: goals.rows });
});
