import { Router } from 'express';
import { computeTable } from '../lib';
import { pool } from '../db';
import { ApiError } from '../errors';
import { parseId } from '../validation';
import { matchRowSelect } from '../lib/matchRowSelect';
import { isEventRevealed, matchClockAt } from '../lib/matchClock';

export const clubsRouter = Router();

clubsRouter.patch('/clubs/:id', async (req, res) => {
  const clubId = parseId(req.params.id);
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 100) throw new ApiError('Club name must be 1-100 characters', 400);
  const result = await pool.query('UPDATE clubs SET name = $1 WHERE id = $2 RETURNING id, name', [name, clubId]);
  if (!result.rowCount) throw new ApiError('Club not found', 404);
  res.json(result.rows[0]);
});

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
  const liveFixtures = fixtures.rows.filter((fixture) => fixture.status === 'live');
  const liveEventResults = await Promise.all(liveFixtures.map((fixture) => pool.query(
    `SELECT e.id, e.seq, e.type, e.club_id, e.player_id, p.name AS player_name,
       e.secondary_player_id, secondary.name AS secondary_player_name,
       e.payload, e.minute, e.minute_extra, e.commentary
     FROM match_events e
     LEFT JOIN players p ON p.id = e.player_id
     LEFT JOIN players secondary ON secondary.id = e.secondary_player_id
     WHERE e.match_id = $1 ORDER BY e.seq`,
    [fixture.id],
  )));
  const liveEventsById = new Map(liveFixtures.map((fixture, index) => [fixture.id, liveEventResults[index].rows]));
  const safeFixtures = fixtures.rows.map((fixture) => {
    if (fixture.status !== 'live') return fixture;
    const allEvents = liveEventsById.get(fixture.id) ?? [];
    const firstExtra = Math.max(0, ...allEvents.filter((event) => event.minute === 45).map((event) => event.minute_extra));
    const secondExtra = Math.max(0, ...allEvents.filter((event) => event.minute === 90).map((event) => event.minute_extra));
    const clock = matchClockAt(fixture.kickoff_at, fixture.duration_seconds, new Date(), firstExtra, secondExtra);
    const events = allEvents.filter((event) => isEventRevealed(event, clock));
    return {
      ...fixture,
      home_goals: events.filter((event) => event.type === 'goal' && Number(event.club_id) === Number(fixture.home_club_id)).length,
      away_goals: events.filter((event) => event.type === 'goal' && Number(event.club_id) === Number(fixture.away_club_id)).length,
      home_xg: events.filter((event) => event.type === 'chance' && Number(event.club_id) === Number(fixture.home_club_id))
        .reduce((sum, event) => sum + Number(event.payload?.xg ?? 0), 0).toFixed(3),
      away_xg: events.filter((event) => event.type === 'chance' && Number(event.club_id) === Number(fixture.away_club_id))
        .reduce((sum, event) => sum + Number(event.payload?.xg ?? 0), 0).toFixed(3),
      minute: clock.minute,
      minute_extra: clock.minuteExtra,
      goal_events: events.filter((event) => event.type === 'goal').map((event) => ({
        club_id: event.club_id, player_name: event.player_name,
        assist_player_name: event.secondary_player_name, minute: event.minute,
      })),
      yellow_card_count: events.filter((event) => event.type === 'yellow').length,
      red_card_count: events.filter((event) => event.type === 'red').length,
    };
  });

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
    fixtures: safeFixtures,
  });
});
