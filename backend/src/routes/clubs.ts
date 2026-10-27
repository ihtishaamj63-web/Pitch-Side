import { Router } from 'express';
import { computeTable } from '../lib';
import { pool } from '../db';
import { ApiError } from '../errors';
import { parseId } from '../validation';
import { matchRowSelect } from '../lib/matchRowSelect';

export const clubsRouter = Router();

clubsRouter.get('/clubs/:id', async (req, res) => {
  const clubId = parseId(req.params.id);
  const clubResult = await pool.query(
    `SELECT c.id, c.league_id, c.name, c.short_name, c.colour_primary,
       c.colour_secondary, c.attack, c.defence,
       l.name AS league_name, l.season_label, l.points_win, l.points_draw
     FROM clubs c JOIN leagues l ON l.id = c.league_id
     WHERE c.id = $1`,
    [clubId],
  );
  const row = clubResult.rows[0];
  if (!row) throw new ApiError('Club not found', 404);

  const [squad, clubs, matches, fixtures] = await Promise.all([
    pool.query(
      `SELECT id, name, position FROM players WHERE club_id = $1
       ORDER BY CASE position WHEN 'GK' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MID' THEN 3 ELSE 4 END, name`,
      [clubId],
    ),
    pool.query(
      'SELECT id, name, attack, defence FROM clubs WHERE league_id = $1 ORDER BY id',
      [row.league_id],
    ),
    pool.query(
      `SELECT matchday, home_club_id, away_club_id, home_goals, away_goals
       FROM matches WHERE league_id = $1 AND home_goals IS NOT NULL ORDER BY matchday, id`,
      [row.league_id],
    ),
    pool.query(
      `SELECT ${matchRowSelect}
       FROM matches m
       JOIN clubs h ON h.id = m.home_club_id
       JOIN clubs a ON a.id = m.away_club_id
       WHERE m.league_id = $1 AND (m.home_club_id = $2 OR m.away_club_id = $2)
       ORDER BY m.matchday, m.id`,
      [row.league_id, clubId],
    ),
  ]);

  const table = computeTable(
    clubs.rows,
    matches.rows.map((match) => ({
      matchday: match.matchday,
      homeClubId: match.home_club_id,
      awayClubId: match.away_club_id,
      homeGoals: match.home_goals,
      awayGoals: match.away_goals,
    })),
    { pointsWin: row.points_win, pointsDraw: row.points_draw },
  );
  const tableRow = table.find((entry) => entry.clubId === clubId);

  res.json({
    club: {
      id: row.id,
      league_id: row.league_id,
      name: row.name,
      short_name: row.short_name,
      colour_primary: row.colour_primary,
      colour_secondary: row.colour_secondary,
      attack: row.attack,
      defence: row.defence,
    },
    league: { id: row.league_id, name: row.league_name, season_label: row.season_label },
    squad: squad.rows,
    form: tableRow?.form ?? [],
    fixtures: fixtures.rows,
  });
});
