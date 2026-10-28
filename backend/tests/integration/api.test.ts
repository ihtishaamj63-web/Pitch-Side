import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from '../../src/app';
import { pool } from '../../src/db';
import { finalizeElapsedMatches } from '../../src/services/simulation';
import { withTransaction } from '../../src/services/transaction';

const clubNames = [
  'Amberlight', 'Bracken Vale', 'Cinder Reach', 'Duskwater',
  'Emberford', 'Fernhollow', 'Glassmere', 'Hearthside',
  'Indigo Field', 'Juniper Bay', 'Kestrel Downs', 'Larkspur',
  'Morrowfen', 'Northglass', 'Orchard Row', 'Pinehaven',
  'Queensmere', 'Rillstone', 'Silverfen', 'Thornwick',
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
  test('deleting one league leaves other leagues intact', async () => {
    const leagueToDelete = await createLeague();
    const leagueToKeep = await createLeague();

    await request(app).delete(`/api/leagues/${leagueToDelete}`).expect(204);

    const leagues = await request(app).get('/api/leagues').expect(200);
    const ids = leagues.body.map((league: { id: number }) => Number(league.id));
    expect(ids).not.toContain(Number(leagueToDelete));
    expect(ids).toContain(Number(leagueToKeep));
    await request(app).get(`/api/leagues/${leagueToKeep}`).expect(200);
  });

  test('manager mode keeps only the selected team fixture live', async () => {
    const leagueId = await createLeague(4);
    const club = await pool.query<{ id: number }>(
      'SELECT id FROM clubs WHERE league_id = $1 ORDER BY id LIMIT 1', [leagueId],
    );

    await request(app)
      .post(`/api/leagues/${leagueId}/matchdays/1/kickoff`)
      .send({ speed: 'quick', managerClubId: club.rows[0].id, tactics: 'balanced' })
      .expect(202);

    const matches = await pool.query<{ status: string; home_club_id: number; away_club_id: number }>(
      'SELECT status, home_club_id, away_club_id FROM matches WHERE league_id = $1 AND matchday = 1',
      [leagueId],
    );
    const liveMatches = matches.rows.filter(match => match.status === 'live');
    const finishedMatches = matches.rows.filter(match => match.status === 'finished');
    expect(liveMatches).toHaveLength(1);
    expect(finishedMatches).toHaveLength(1);
    expect([liveMatches[0].home_club_id, liveMatches[0].away_club_id]).toContain(club.rows[0].id);
  });
  test('creates a 16-club double round-robin season with full squads', async () => {
    const leagueId = await createLeague(16);
    const matches = await pool.query<{ count: number; matchdays: number }>(
      'SELECT COUNT(*)::int AS count, COUNT(DISTINCT matchday)::int AS matchdays FROM matches WHERE league_id = $1',
      [leagueId],
    );
    const players = await pool.query<{ count: number; unique_names: number }>(
      'SELECT COUNT(*)::int AS count, COUNT(DISTINCT p.name)::int AS unique_names FROM players p JOIN clubs c ON c.id = p.club_id WHERE c.league_id = $1',
      [leagueId],
    );

    expect(matches.rows[0]).toEqual({ count: 240, matchdays: 30 });
    expect(players.rows[0].count).toBe(224);
    expect(players.rows[0].unique_names).toBe(224);
  });

  test('generates unique player names in a 20-club league', async () => {
    const leagueId = await createLeague(20);
    const players = await pool.query<{ count: number; unique_names: number }>(
      'SELECT COUNT(*)::int AS count, COUNT(DISTINCT p.name)::int AS unique_names FROM players p JOIN clubs c ON c.id = p.club_id WHERE c.league_id = $1',
      [leagueId],
    );

    expect(players.rows[0]).toEqual({ count: 280, unique_names: 280 });
  });

  test('schedules each matchday from the configured season start and cadence', async () => {
    const response = await request(app).post('/api/leagues').send({
      ...makeLeague(), season_start_date: '2027-01-03', matchday_cadence_days: 14,
    }).expect(201);
    const dates = await pool.query<{ matchday: number; scheduled_at: Date }>(
      `SELECT matchday, MIN(scheduled_at) AS scheduled_at FROM matches
       WHERE league_id = $1 GROUP BY matchday ORDER BY matchday LIMIT 2`,
      [response.body.id],
    );
    expect(dates.rows[0].scheduled_at.toISOString()).toBe('2027-01-03T12:00:00.000Z');
    expect(dates.rows[1].scheduled_at.getTime() - dates.rows[0].scheduled_at.getTime()).toBe(14 * 86_400_000);
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
    expect(report.body.status).toBe('finished');
    expect(report.body.team_stats).toHaveLength(2);
    expect(report.body.player_stats).toHaveLength(28);
    for (const clubId of [fixtures.body[0].home_club_id, fixtures.body[0].away_club_id]) {
      expect(report.body.player_stats.filter((player: { club_id: number; is_starter: boolean }) =>
        player.club_id === clubId && player.is_starter,
      )).toHaveLength(11);
      expect(report.body.substitutions.filter((substitution: { club_id: number }) =>
        substitution.club_id === clubId,
      )).toHaveLength(3);
    }
    expect(report.body.fouls.length).toBeGreaterThan(0);
    expect(report.body.team_stats.reduce((sum: number, stats: { fouls: number }) => sum + stats.fouls, 0))
      .toBe(report.body.fouls.length);
    report.body.goals.forEach((goal: { player_name: string; assist_player_name: string | null }) => {
      expect(goal.player_name).toEqual(expect.any(String));
      if (goal.assist_player_name !== null) expect(goal.assist_player_name).toEqual(expect.any(String));
    });
  });

  test('live kick-off reveals only clocked events and restart-safe finalization stores the result', async () => {
    const leagueId = await createLeague();
    const kickoff = await request(app)
      .post(`/api/leagues/${leagueId}/matchdays/1/kickoff`)
      .send({ speed: 'quick' })
      .expect(202);
    expect(kickoff.body).toMatchObject({ status: 'live', matchday: 1, matchesStarted: 2 });
    const fixtures = await pool.query<{
      id: number; home_club_id: number; away_club_id: number; simulation_result: { events: Array<{ type: string; minute: number; minuteExtra: number }> };
    }>(
      `SELECT id, home_club_id, away_club_id, simulation_result
       FROM matches WHERE league_id = $1 AND matchday = 1 ORDER BY id`,
      [leagueId],
    );
    const firstMatch = fixtures.rows[0];
    const firstChance = firstMatch.simulation_result.events.find((event) => event.type === 'chance')!;
    const fullEventRows = await pool.query(
      'SELECT id, seq, type, minute, minute_extra FROM match_events WHERE match_id = $1 ORDER BY seq',
      [firstMatch.id],
    );
    const firstExtra = Math.max(0, ...fullEventRows.rows.filter((event) => event.minute === 45).map((event) => event.minute_extra));
    const elapsedSeconds = (firstChance.minute + firstChance.minuteExtra + 0.2) / (45 + firstExtra) * 45;
    await pool.query(
      `UPDATE matches SET kickoff_at = NOW() - ($1::numeric * INTERVAL '1 second'), duration_seconds = 90
       WHERE id IN (SELECT id FROM matches WHERE league_id = $2 AND matchday = 1)`,
      [elapsedSeconds, leagueId],
    );

    const report = await request(app).get(`/api/matches/${firstMatch.id}`).expect(200);
    expect(report.body.status).toBe('live');
    expect(report.body.events.some((event: { type: string }) => event.type === 'full_time')).toBe(false);
    expect(report.body.events.every((event: { id: number }) => fullEventRows.rows.some((stored) => stored.id === event.id))).toBe(true);
    expect(report.body.events.length).toBeLessThan(fullEventRows.rows.length);
    expect(report.body.player_stats).toEqual([]);
    expect(report.body.lineups.filter((player: { club_id: number; is_starter: boolean }) => player.club_id === firstMatch.home_club_id && player.is_starter)).toHaveLength(11);
    expect(Object.keys(report.body.lineups[0]).sort()).toEqual(['club_id', 'is_starter', 'player_id', 'player_name', 'position']);
    const revealedGoals = report.body.events.filter((event: { type: string }) => event.type === 'goal');
    expect(report.body.home_goals).toBe(revealedGoals.filter((event: { club_id: number }) => event.club_id === firstMatch.home_club_id).length);
    expect(report.body.away_goals).toBe(revealedGoals.filter((event: { club_id: number }) => event.club_id === firstMatch.away_club_id).length);

    const fixturesRead = await request(app).get(`/api/leagues/${leagueId}/matches?matchday=1`).expect(200);
    expect(fixturesRead.body.find((fixture: { id: number }) => fixture.id === firstMatch.id)).toMatchObject({
      status: 'live', home_goals: report.body.home_goals, away_goals: report.body.away_goals,
    });
    const table = await request(app).get(`/api/leagues/${leagueId}/table`).expect(200);
    expect(table.body.filter((row: { live: boolean }) => row.live)).toHaveLength(4);
    const playerStats = await request(app).get(`/api/leagues/${leagueId}/player-stats`).expect(200);
    expect(playerStats.body).toEqual([]);
    const club = await request(app).get(`/api/clubs/${firstMatch.home_club_id}`).expect(200);
    expect(club.body.fixtures.find((fixture: { id: number }) => fixture.id === firstMatch.id).home_goals).toBe(report.body.home_goals);
    const incremental = await request(app).get(`/api/matches/${firstMatch.id}/live?after=0`).expect(200);
    expect(incremental.body).toMatchObject({
      status: 'live', home_goals: report.body.home_goals, away_goals: report.body.away_goals,
    });
    expect(incremental.body.events.every((event: { id: number }) => fullEventRows.rows.some((stored) => stored.id === event.id))).toBe(true);
    const cursor = Math.max(0, ...incremental.body.events.map((event: { seq: number }) => event.seq));
    const caughtUp = await request(app).get(`/api/matches/${firstMatch.id}/live?after=${cursor}`).expect(200);
    expect(caughtUp.body.events).toEqual([]);
    await request(app).post(`/api/leagues/${leagueId}/matchdays/2/kickoff`).send({ speed: 'quick' }).expect(409);

    await pool.query(
      `UPDATE matches SET kickoff_at = NOW() - make_interval(secs => duration_seconds + 10)
       WHERE league_id = $1 AND status = 'live'`,
      [leagueId],
    );
    await withTransaction(finalizeElapsedMatches);
    const finished = await pool.query<{ status: string; home_goals: number; away_goals: number; simulation_result: { homeGoals: number; awayGoals: number } }>(
      `SELECT status, home_goals, away_goals, simulation_result FROM matches WHERE id = $1`,
      [firstMatch.id],
    );
    expect(finished.rows[0]).toMatchObject({
      status: 'finished',
      home_goals: finished.rows[0].simulation_result.homeGoals,
      away_goals: finished.rows[0].simulation_result.awayGoals,
    });
    const tableHistory = await request(app).get(`/api/leagues/${leagueId}/table/history`).expect(200);
    expect(tableHistory.body).toHaveLength(1);
    expect(tableHistory.body[0].positions).toHaveLength(4);
    await request(app).post(`/api/leagues/${leagueId}/reset`).expect(200);
    await request(app).post(`/api/leagues/${leagueId}/simulate/next`).expect(200);
    const instant = await pool.query<{ simulation_result: unknown }>(
      'SELECT simulation_result FROM matches WHERE id = $1',
      [firstMatch.id],
    );
    expect(instant.rows[0].simulation_result).toEqual(firstMatch.simulation_result);
  });

  test('simulates the full season in one request', async () => {
    const leagueId = await createLeague();
    const response = await request(app).post(`/api/leagues/${leagueId}/simulate/all`).expect(200);
    expect(response.body).toEqual({ matchdaysPlayed: 6, matchesPlayed: 12 });

    const remaining = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM matches WHERE league_id = $1 AND home_goals IS NULL',
      [leagueId],
    );
    expect(remaining.rows[0].count).toBe(0);
    await request(app).post(`/api/leagues/${leagueId}/simulate/all`).expect(200, {
      matchdaysPlayed: 0,
      matchesPlayed: 0,
    });
  });

  test('applies manager tactics only to a club selected from the league', async () => {
    const leagueId = await createLeague();
    const clubs = await pool.query<{ id: number }>(
      'SELECT id FROM clubs WHERE league_id = $1 ORDER BY id',
      [leagueId],
    );
    const managedClubId = clubs.rows[0].id;
    const response = await request(app)
      .post(`/api/leagues/${leagueId}/simulate/next`)
      .send({ managerClubId: managedClubId, tactics: 'attacking' })
      .expect(200);

    expect(response.body).toMatchObject({
      matchday: 1,
      matchesPlayed: 2,
      managerMatch: {
        clubId: managedClubId,
        matchday: 1,
        tactics: 'attacking',
        goalsFor: expect.any(Number),
        goalsAgainst: expect.any(Number),
        expectedGoalsFor: expect.any(Number),
        expectedGoalsAgainst: expect.any(Number),
      },
    });

    const otherLeagueId = await createLeague();
    const otherClub = await pool.query<{ id: number }>(
      'SELECT id FROM clubs WHERE league_id = $1 ORDER BY id LIMIT 1',
      [otherLeagueId],
    );
    await request(app)
      .post(`/api/leagues/${leagueId}/simulate/next`)
      .send({ managerClubId: otherClub.rows[0].id, tactics: 'defensive' })
      .expect(400);
    await request(app)
      .post(`/api/leagues/${leagueId}/simulate/next`)
      .send({ managerClubId: managedClubId })
      .expect(400);
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
      substitutions: number;
      team_stats: number;
      player_stats: number;
    }>(
      `SELECT
        (SELECT COUNT(*)::int FROM matches WHERE league_id = $1 AND home_goals IS NOT NULL) AS played,
        (SELECT COUNT(*)::int FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.league_id = $1 AND e.type = 'goal') AS goals,
        (SELECT COUNT(*)::int FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.league_id = $1 AND e.type = 'yellow') AS yellow_cards,
        (SELECT COUNT(*)::int FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.league_id = $1 AND e.type = 'red') AS red_cards,
        (SELECT COUNT(*)::int FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.league_id = $1 AND e.type = 'foul') AS fouls,
        (SELECT COUNT(*)::int FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.league_id = $1 AND e.type = 'substitution') AS substitutions,
        (SELECT COUNT(*)::int FROM match_team_stats s JOIN matches m ON m.id = s.match_id WHERE m.league_id = $1) AS team_stats,
        (SELECT COUNT(*)::int FROM player_match_stats s JOIN matches m ON m.id = s.match_id WHERE m.league_id = $1) AS player_stats`,
      [leagueId],
    );
    expect(result.rows[0]).toEqual({
      played: 0, goals: 0, yellow_cards: 0, red_cards: 0, fouls: 0, substitutions: 0, team_stats: 0, player_stats: 0,
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
      status: 'scheduled',
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
      "UPDATE matches SET home_goals = 1, away_goals = 1, played_at = NOW(), status = 'finished' WHERE id = $1",
      [match.rows[0].id],
    );
    await pool.query(
      `INSERT INTO match_events (match_id, seq, minute, type, club_id, player_id) VALUES
       ($1, 1, 12, 'goal', $2, $3), ($1, 2, 44, 'goal', $4, $5)`,
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
      "UPDATE matches SET home_goals = 1, away_goals = 0, played_at = NOW(), status = 'finished' WHERE id = $1",
      [fixture.id],
    );
    await pool.query(
      `INSERT INTO match_events
        (match_id, seq, club_id, player_id, secondary_player_id, minute, type)
       VALUES ($1, 1, $2, $3, $4, 24, 'goal')`,
      [fixture.id, fixture.home_club_id, homePlayers.rows[0].id, homePlayers.rows[1].id],
    );
    await pool.query(
      `INSERT INTO match_events (match_id, seq, club_id, player_id, minute, type)
       VALUES ($1, 2, $2, $3, 51, 'yellow')`,
      [fixture.id, fixture.away_club_id, awayPlayers.rows[0].id],
    );
    await pool.query(
      `INSERT INTO match_events (match_id, seq, club_id, player_id, minute, type)
       VALUES ($1, 3, $2, $3, 72, 'red')`,
      [fixture.id, fixture.away_club_id, awayPlayers.rows[0].id],
    );
    await pool.query(
      `INSERT INTO match_events (match_id, seq, club_id, player_id, minute, type)
       VALUES ($1, 4, $2, $3, 66, 'foul')`,
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
      expect.objectContaining({ club_id: fixture.home_club_id, xg: '1.250', shots: 12 }),
      expect.objectContaining({ club_id: fixture.away_club_id, xg: '0.310', saves: 4 }),
    ]));
    expect(match.body.player_stats).toHaveLength(3);

    const fixtures = await request(app).get(`/api/leagues/${leagueId}/matches`).expect(200);
    expect(fixtures.body[0].goal_events[0]).toMatchObject({
      player_name: expect.any(String),
      assist_player_name: expect.any(String),
      minute: 24,
    });

    const leaders = await request(app).get(`/api/leagues/${leagueId}/player-stats`).expect(200);
    expect(leaders.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ player_id: homePlayers.rows[0].id, position: expect.stringMatching(/^(GK|DEF|MID|FWD)$/), goals: 1, assists: 0 }),
      expect.objectContaining({ player_id: homePlayers.rows[1].id, goals: 0, assists: 1 }),
      expect.objectContaining({ player_id: awayPlayers.rows[0].id, yellow_cards: 1 }),
      expect.objectContaining({
        player_id: awayPlayers.rows[0].id, red_cards: 1, fouls: 1, appearances: 1, minutes: 72,
      }),
    ]));
  });

  test('migration 004 preserves all legacy match events in sequence', async () => {
    const migration = await fs.readFile(
      path.resolve(__dirname, '../../../sql/migrations/004_match_lifecycle_events.sql'), 'utf8',
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE SCHEMA migration_fixture');
      await client.query('SET LOCAL search_path TO migration_fixture');
      await client.query(`
        CREATE TABLE clubs (id INTEGER PRIMARY KEY);
        CREATE TABLE players (id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL REFERENCES clubs(id));
        CREATE TABLE matches (
          id INTEGER PRIMARY KEY, home_goals INTEGER, away_goals INTEGER,
          played_at TIMESTAMPTZ
        );
        CREATE TABLE goals (
          id INTEGER PRIMARY KEY, match_id INTEGER REFERENCES matches(id),
          club_id INTEGER REFERENCES clubs(id), player_id INTEGER REFERENCES players(id),
          assist_player_id INTEGER REFERENCES players(id), minute INTEGER
        );
        CREATE TABLE yellow_cards (
          id INTEGER PRIMARY KEY, match_id INTEGER REFERENCES matches(id),
          club_id INTEGER REFERENCES clubs(id), player_id INTEGER REFERENCES players(id), minute INTEGER
        );
        CREATE TABLE red_cards (
          id INTEGER PRIMARY KEY, match_id INTEGER REFERENCES matches(id),
          club_id INTEGER REFERENCES clubs(id), player_id INTEGER REFERENCES players(id), minute INTEGER
        );
        CREATE TABLE fouls (
          id INTEGER PRIMARY KEY, match_id INTEGER REFERENCES matches(id),
          club_id INTEGER REFERENCES clubs(id), player_id INTEGER REFERENCES players(id), minute INTEGER
        );
        CREATE TABLE substitutions (
          id INTEGER PRIMARY KEY, match_id INTEGER REFERENCES matches(id),
          club_id INTEGER REFERENCES clubs(id), player_off_id INTEGER, player_on_id INTEGER, minute INTEGER
        );
        INSERT INTO clubs VALUES (1), (2);
        INSERT INTO players VALUES (10, 1), (11, 1), (20, 2);
        INSERT INTO matches VALUES (100, 1, 0, NOW());
        INSERT INTO goals VALUES (1, 100, 1, 10, 11, 20);
        INSERT INTO yellow_cards VALUES (1, 100, 2, 20, 40);
        INSERT INTO red_cards VALUES (1, 100, 2, 20, 70);
        INSERT INTO fouls VALUES (1, 100, 2, 20, 30);
        INSERT INTO substitutions VALUES (1, 100, 1, 10, 11, 60);
      `);
      await client.query(migration);
      const migrated = await client.query(
        `SELECT type, minute, player_id, secondary_player_id
         FROM match_events WHERE match_id = 100 ORDER BY seq`,
      );
      expect(migrated.rows).toEqual([
        { type: 'goal', minute: 20, player_id: 10, secondary_player_id: 11 },
        { type: 'foul', minute: 30, player_id: 20, secondary_player_id: null },
        { type: 'yellow', minute: 40, player_id: 20, secondary_player_id: null },
        { type: 'substitution', minute: 60, player_id: 11, secondary_player_id: 10 },
        { type: 'red', minute: 70, player_id: 20, secondary_player_id: null },
      ]);
      const lifecycle = await client.query('SELECT status, kickoff_at IS NOT NULL AS has_kickoff FROM matches WHERE id = 100');
      expect(lifecycle.rows[0]).toEqual({ status: 'finished', has_kickoff: true });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('uses one event table and exposes the player-stats route', async () => {
    const eventTables = await pool.query<{ table_name: string; present: boolean }>(
      `SELECT name AS table_name, to_regclass(name) IS NOT NULL AS present
       FROM unnest(ARRAY['match_events', 'goals', 'yellow_cards', 'red_cards', 'fouls', 'substitutions']) name`,
    );
    const presence = Object.fromEntries(eventTables.rows.map((row) => [row.table_name, row.present]));
    expect(presence).toEqual({
      match_events: true, goals: false, yellow_cards: false,
      red_cards: false, fouls: false, substitutions: false,
    });
    const leagueId = await createLeague();
    await request(app).get(`/api/leagues/${leagueId}/player-stats`).expect(200);
  });

  test('returns a dedicated player profile without exposing unfinished match stats', async () => {
    const leagueId = await createLeague();
    const player = await pool.query<{ id: number; name: string; position: string }>(
      `SELECT p.id, p.name, p.position FROM players p
       JOIN clubs c ON c.id = p.club_id WHERE c.league_id = $1 ORDER BY p.id LIMIT 1`,
      [leagueId],
    );
    const response = await request(app).get(`/api/players/${player.rows[0].id}`).expect(200);
    expect(response.body.player).toMatchObject({
      id: player.rows[0].id, name: player.rows[0].name, position: player.rows[0].position,
    });
    expect(response.body.matches).toEqual([]);
  });
});
