import request from 'supertest';
import { app } from '../../src/app';
import { pool } from '../../src/db';

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

    const result = await pool.query<{ played: number; goals: number }>(
      `SELECT
        (SELECT COUNT(*)::int FROM matches WHERE league_id = $1 AND home_goals IS NOT NULL) AS played,
        (SELECT COUNT(*)::int FROM goals g JOIN matches m ON m.id = g.match_id WHERE m.league_id = $1) AS goals`,
      [leagueId],
    );
    expect(result.rows[0]).toEqual({ played: 0, goals: 0 });
  });

  test.each([
    ['too few clubs', { ...makeLeague(3) }],
    ['duplicate club names', { ...makeLeague(), clubs: makeLeague().clubs.map((club) => ({ ...club, name: 'Duplicate' })) }],
    ['out-of-range rating', { ...makeLeague(), clubs: makeLeague().clubs.map((club, index) => index === 0 ? { ...club, attack: 0 } : club) }],
  ])('rejects invalid league payload: %s', async (_label, body) => {
    await request(app).post('/api/leagues').send(body).expect(400);
  });

  test('forecasts return a normalized position distribution for each club', async () => {
    const leagueId = await createLeague();
    const response = await request(app)
      .post(`/api/leagues/${leagueId}/forecast`)
      .send({ runs: 20, seed: 123 })
      .expect(200);

    expect(response.body.results).toHaveLength(4);
    for (const row of response.body.results) {
      const total = Object.values(row.positions as Record<string, number>)
        .reduce((sum, probability) => sum + probability, 0);
      expect(total).toBeCloseTo(1, 10);
    }
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
});
