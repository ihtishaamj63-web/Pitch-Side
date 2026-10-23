import request from 'supertest';
import { app } from '../../src/app';
import { pool } from '../../src/db';
import { applyMigrations } from '../../src/services/migrations';

const clubNames = [
  'Amberlight', 'Bracken Vale', 'Cinder Reach', 'Duskwater',
  'Emberford', 'Fernhollow', 'Glassmere', 'Hearthside',
  'Indigo Field', 'Juniper Bay', 'Kestrel Downs', 'Larkspur',
  'Morrowfen', 'Northglass', 'Orchard Row', 'Pinehaven',
];

function makeLeague(clubCount = 4) {
  return {
    name: 'Test league',
    season_label: '2026',
    points_win: 3,
    points_draw: 1,
    top_zone: 2,
    bottom_zone: 1,
    clubs: clubNames.slice(0, clubCount).map((name, index) => ({
      name,
      short_name: `C${String.fromCharCode(65 + index)}X`,
      colour_primary: '#19e68c',
      colour_secondary: '#121a24',
      attack: 70 + index,
      defence: 70 + index,
    })),
  };
}

async function createLeague(clubCount = 4) {
  const response = await request(app).post('/api/leagues').send(makeLeague(clubCount));
  expect(response.status).toBe(201);
  return response.body.id as number;
}

describe('Pitch API', () => {
  test('creates a 16-club double round-robin season with full squads', async () => {
    const leagueId = await createLeague(16);
    const matches = await pool.query<{ count: number; matchdays: number }>(
      'SELECT COUNT(*)::int AS count, COUNT(DISTINCT matchday)::int AS matchdays FROM matches WHERE league_id = $1',
      [leagueId],
    );
    const players = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM players p JOIN clubs c ON c.id = p.club_id WHERE c.league_id = $1',
      [leagueId],
    );

    expect(matches.rows[0]).toEqual({ count: 240, matchdays: 30 });
    expect(players.rows[0].count).toBe(224);
  });

  test('simulates one full matchday and keeps aggregate goals balanced', async () => {
    const leagueId = await createLeague(16);
    const response = await request(app).post(`/api/leagues/${leagueId}/simulate/next`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matchday: 1, matchesPlayed: 8 });

    const table = await request(app).get(`/api/leagues/${leagueId}/table`).expect(200);
    const goalsFor = table.body.reduce((sum: number, row: { GF: number }) => sum + row.GF, 0);
    const goalsAgainst = table.body.reduce((sum: number, row: { GA: number }) => sum + row.GA, 0);
    expect(goalsFor).toBe(goalsAgainst);
    expect(table.body.every((row: { movement: number }) => Number.isInteger(row.movement))).toBe(true);

    const fixtures = await request(app).get(`/api/leagues/${leagueId}/matches?matchday=1`).expect(200);
    expect(fixtures.body).toHaveLength(8);
    expect(fixtures.body[0]).toMatchObject({
      home_xg: expect.any(String),
      away_xg: expect.any(String),
      goal_events: expect.any(Array),
      yellow_card_count: expect.any(Number),
      red_card_count: expect.any(Number),
    });
    const report = await request(app).get(`/api/matches/${fixtures.body[0].id}`).expect(200);
    expect(report.body.team_stats).toHaveLength(2);
    expect(report.body.player_stats).toHaveLength(28);
    expect(report.body.fouls.length).toBeGreaterThan(0);
    expect(report.body.team_stats.reduce((sum: number, stats: { fouls: number }) => sum + stats.fouls, 0))
      .toBe(report.body.fouls.length);
    report.body.goals.forEach((goal: { player_name: string; assist_player_name: string | null }) => {
      expect(goal.player_name).toEqual(expect.any(String));
      if (goal.assist_player_name !== null) expect(goal.assist_player_name).toEqual(expect.any(String));
    });
  });

  test('serializes parallel next-matchday requests', async () => {
    const leagueId = await createLeague();
    const responses = await Promise.all([
      request(app).post(`/api/leagues/${leagueId}/simulate/next`),
      request(app).post(`/api/leagues/${leagueId}/simulate/next`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.map((response) => response.body.matchday).sort()).toEqual([1, 2]);
    const played = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM matches WHERE league_id = $1 AND home_goals IS NOT NULL',
      [leagueId],
    );
    expect(played.rows[0].count).toBe(4);
  });

  test('reset clears scores and goal events', async () => {
    const leagueId = await createLeague();
    await request(app).post(`/api/leagues/${leagueId}/simulate/next`).expect(200);
    await request(app).post(`/api/leagues/${leagueId}/reset`).expect(200);

    const result = await pool.query<{
      played: number;
      goals: number;
      yellow_cards: number;
      red_cards: number;
      fouls: number;
      team_stats: number;
      player_stats: number;
    }>(
      `SELECT
        (SELECT COUNT(*)::int FROM matches WHERE league_id = $1 AND home_goals IS NOT NULL) AS played,
        (SELECT COUNT(*)::int FROM goals g JOIN matches m ON m.id = g.match_id WHERE m.league_id = $1) AS goals,
        (SELECT COUNT(*)::int FROM yellow_cards yc JOIN matches m ON m.id = yc.match_id WHERE m.league_id = $1) AS yellow_cards,
        (SELECT COUNT(*)::int FROM red_cards rc JOIN matches m ON m.id = rc.match_id WHERE m.league_id = $1) AS red_cards,
        (SELECT COUNT(*)::int FROM fouls f JOIN matches m ON m.id = f.match_id WHERE m.league_id = $1) AS fouls,
        (SELECT COUNT(*)::int FROM match_team_stats s JOIN matches m ON m.id = s.match_id WHERE m.league_id = $1) AS team_stats,
        (SELECT COUNT(*)::int FROM player_match_stats s JOIN matches m ON m.id = s.match_id WHERE m.league_id = $1) AS player_stats`,
      [leagueId],
    );
    expect(result.rows[0]).toEqual({
      played: 0, goals: 0, yellow_cards: 0, red_cards: 0, fouls: 0, team_stats: 0, player_stats: 0,
    });
  });

  test.each([
    ['too few clubs', { ...makeLeague(3) }],
    ['duplicate club names', { ...makeLeague(), clubs: makeLeague().clubs.map((club) => ({ ...club, name: 'Duplicate' })) }],
    ['out-of-range rating', { ...makeLeague(), clubs: makeLeague().clubs.map((club, index) => index === 0 ? { ...club, attack: 0 } : club) }],
  ])('rejects invalid league payload: %s', async (_label, body) => {
    await request(app).post('/api/leagues').send(body).expect(400);
  });

  test('exposes match and club fields required by the frontend', async () => {
    const leagueId = await createLeague();
    const matches = await request(app).get(`/api/leagues/${leagueId}/matches`).expect(200);
    const fixture = matches.body[0];
    expect(fixture).toMatchObject({
      home_club_name: expect.any(String),
      away_club_name: expect.any(String),
      home_colour_primary: expect.any(String),
      away_colour_secondary: expect.any(String),
    });

    const match = await request(app).get(`/api/matches/${fixture.id}`).expect(200);
    expect(match.body).toMatchObject({
      home_club_name: fixture.home_club_name,
      away_club_name: fixture.away_club_name,
      home_colour_primary: fixture.home_colour_primary,
      away_colour_secondary: fixture.away_colour_secondary,
    });
    expect(match.body.goals).toEqual([]);
    expect(match.body).toMatchObject({
      team_stats: [],
      player_stats: [],
      red_cards: [],
      fouls: [],
    });

    const club = await request(app).get(`/api/clubs/${fixture.home_club_id}`).expect(200);
    expect(club.body.league.id).toBe(leagueId);
    expect(club.body.fixtures[0]).toMatchObject({
      home_club_name: expect.any(String),
      away_club_name: expect.any(String),
      home_colour_primary: expect.any(String),
    });
  });

  test('shares scorer rank when players have equal goal totals', async () => {
    const leagueId = await createLeague();
    const match = await pool.query<{ id: number; home_club_id: number; away_club_id: number }>(
      'SELECT id, home_club_id, away_club_id FROM matches WHERE league_id = $1 ORDER BY id LIMIT 1',
      [leagueId],
    );
    const playerIds = await Promise.all([match.rows[0].home_club_id, match.rows[0].away_club_id]
      .map((clubId) => pool.query<{ id: number }>(
        'SELECT id FROM players WHERE club_id = $1 ORDER BY id LIMIT 1',
        [clubId],
      )));
    await pool.query(
      'UPDATE matches SET home_goals = 1, away_goals = 1, played_at = NOW() WHERE id = $1',
      [match.rows[0].id],
    );
    await pool.query(
      `INSERT INTO goals (match_id, club_id, player_id, minute) VALUES
       ($1, $2, $3, 12), ($1, $4, $5, 44)`,
      [
        match.rows[0].id,
        match.rows[0].home_club_id,
        playerIds[0].rows[0].id,
        match.rows[0].away_club_id,
        playerIds[1].rows[0].id,
      ],
    );

    const response = await request(app).get(`/api/leagues/${leagueId}/scorers`).expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body.map((row: { rank: number }) => row.rank)).toEqual([1, 1]);
  });

  test('returns goal involvements and yellow cards in match and player statistics', async () => {
    const leagueId = await createLeague();
    const fixtureResult = await pool.query<{ id: number; home_club_id: number; away_club_id: number }>(
      'SELECT id, home_club_id, away_club_id FROM matches WHERE league_id = $1 ORDER BY id LIMIT 1',
      [leagueId],
    );
    const fixture = fixtureResult.rows[0];
    const [homePlayers, awayPlayers] = await Promise.all([
      pool.query<{ id: number }>('SELECT id FROM players WHERE club_id = $1 ORDER BY id LIMIT 2', [fixture.home_club_id]),
      pool.query<{ id: number }>('SELECT id FROM players WHERE club_id = $1 ORDER BY id LIMIT 1', [fixture.away_club_id]),
    ]);
    await pool.query(
      'UPDATE matches SET home_goals = 1, away_goals = 0, played_at = NOW() WHERE id = $1',
      [fixture.id],
    );
    await pool.query(
      'INSERT INTO goals (match_id, club_id, player_id, assist_player_id, minute) VALUES ($1, $2, $3, $4, 24)',
      [fixture.id, fixture.home_club_id, homePlayers.rows[0].id, homePlayers.rows[1].id],
    );
    await pool.query(
      'INSERT INTO yellow_cards (match_id, club_id, player_id, minute) VALUES ($1, $2, $3, 51)',
      [fixture.id, fixture.away_club_id, awayPlayers.rows[0].id],
    );
    await pool.query(
      'INSERT INTO red_cards (match_id, club_id, player_id, minute) VALUES ($1, $2, $3, 72)',
      [fixture.id, fixture.away_club_id, awayPlayers.rows[0].id],
    );
    await pool.query(
      'INSERT INTO fouls (match_id, club_id, player_id, minute) VALUES ($1, $2, $3, 66)',
      [fixture.id, fixture.away_club_id, awayPlayers.rows[0].id],
    );
    await pool.query(
      `UPDATE matches SET home_xg = 1.25, away_xg = 0.31 WHERE id = $1`,
      [fixture.id],
    );
    await pool.query(
      `INSERT INTO match_team_stats
        (match_id, club_id, possession, shots, shots_on_target, corners, fouls, saves)
       VALUES ($1, $2, 58, 12, 5, 6, 8, 0), ($1, $3, 42, 4, 1, 2, 13, 4)`,
      [fixture.id, fixture.home_club_id, fixture.away_club_id],
    );
    await pool.query(
      `INSERT INTO player_match_stats
        (match_id, club_id, player_id, minutes_played, shots, shots_on_target, xg, key_passes, tackles)
       VALUES
        ($1, $2, $3, 90, 2, 1, 0.4, 0, 1),
        ($1, $2, $4, 90, 1, 0, 0.1, 1, 2),
        ($1, $5, $6, 72, 1, 0, 0.05, 0, 1)`,
      [
        fixture.id, fixture.home_club_id, homePlayers.rows[0].id, homePlayers.rows[1].id,
        fixture.away_club_id, awayPlayers.rows[0].id,
      ],
    );

    const match = await request(app).get(`/api/matches/${fixture.id}`).expect(200);
    expect(match.body.goals[0]).toMatchObject({
      player_id: homePlayers.rows[0].id,
      assist_player_id: homePlayers.rows[1].id,
      minute: 24,
    });
    expect(match.body.yellow_cards[0]).toMatchObject({
      player_id: awayPlayers.rows[0].id,
      minute: 51,
    });
    expect(match.body.red_cards[0]).toMatchObject({
      player_id: awayPlayers.rows[0].id,
      minute: 72,
    });
    expect(match.body.fouls[0]).toMatchObject({
      player_id: awayPlayers.rows[0].id,
      minute: 66,
    });
    expect(match.body.team_stats).toEqual(expect.arrayContaining([
      expect.objectContaining({ club_id: fixture.home_club_id, xg: '1.25', shots: 12 }),
      expect.objectContaining({ club_id: fixture.away_club_id, xg: '0.31', saves: 4 }),
    ]));
    expect(match.body.player_stats).toHaveLength(3);

    const fixtures = await request(app).get(`/api/leagues/${leagueId}/matches`).expect(200);
    expect(fixtures.body[0].goal_events[0]).toMatchObject({
      player_name: expect.any(String),
      assist_player_name: expect.any(String),
      minute: 24,
    });

    const leaders = await request(app).get(`/api/leagues/${leagueId}/scorers`).expect(200);
    expect(leaders.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ player_id: homePlayers.rows[0].id, goals: 1, assists: 0 }),
      expect.objectContaining({ player_id: homePlayers.rows[1].id, goals: 0, assists: 1 }),
      expect.objectContaining({ player_id: awayPlayers.rows[0].id, yellow_cards: 1 }),
      expect.objectContaining({
        player_id: awayPlayers.rows[0].id, red_cards: 1, fouls: 1, appearances: 1, minutes: 72,
      }),
    ]));
  });

  test('applies pending SQL migrations for a database created with an older schema', async () => {
    await pool.query('DROP TABLE yellow_cards, red_cards, fouls, match_team_stats, player_match_stats');
    await pool.query('ALTER TABLE goals DROP COLUMN assist_player_id');
    await pool.query('ALTER TABLE matches DROP COLUMN home_xg, DROP COLUMN away_xg');

    expect(await applyMigrations(pool)).toEqual([
      '001_match_events.sql',
      '002_detailed_match_stats.sql',
    ]);
    expect(await applyMigrations(pool)).toEqual([]);

    const tables = await pool.query<{ name: string | null }>(
      `SELECT to_regclass(name)::text AS name
       FROM unnest(ARRAY['yellow_cards', 'red_cards', 'fouls', 'match_team_stats', 'player_match_stats']) name`,
    );
    expect(tables.rows.every((row) => row.name !== null)).toBe(true);

    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND (
         (table_name = 'goals' AND column_name = 'assist_player_id')
         OR (table_name = 'matches' AND column_name IN ('home_xg', 'away_xg'))
       )`,
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([
      'assist_player_id',
      'away_xg',
      'home_xg',
    ]);
  });
});
