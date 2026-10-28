import type { PoolClient } from 'pg';
import { generateFixtures, assertFixtureClubsInLeague } from '../lib';
import type { createLeagueSchema } from '../validation';
import type { z } from 'zod';

export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;

const firstNames = [
  'Ari', 'Belen', 'Caro', 'Dara', 'Eris', 'Fenn', 'Galen',
  'Hali', 'Iven', 'Jori', 'Kelis', 'Lumen', 'Maren', 'Neris',
  'Oriel', 'Perrin', 'Quin', 'Riven', 'Solen', 'Tavi',
];
const lastNames = [
  'Vale', 'Morrow', 'Fen', 'Wick', 'Arden', 'Kestrel', 'Dale',
  'Rowan', 'Sable', 'Moss', 'Tallow', 'Briar', 'Wren', 'Quill',
];
const squadPositions = [
  'GK',
  'DEF', 'DEF', 'DEF', 'DEF',
  'MID', 'MID', 'MID', 'MID', 'MID',
  'FWD', 'FWD', 'FWD', 'FWD',
] as const;

export async function createLeague(client: PoolClient, input: CreateLeagueInput) {
  const leagueResult = await client.query<{ id: number }>(
    `INSERT INTO leagues (name, season_label, points_win, points_draw, top_zone, bottom_zone)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.name, input.season_label, input.points_win, input.points_draw, input.top_zone, input.bottom_zone],
  );
  const leagueId = leagueResult.rows[0].id;
  const clubIds: number[] = [];
  const clubLeagueIds = new Map<number, number>();

  for (let index = 0; index < input.clubs.length; index += 1) {
    const club = input.clubs[index];
    const result = await client.query<{ id: number }>(
      `INSERT INTO clubs
        (league_id, name, short_name, colour_primary, colour_secondary, attack, defence)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [leagueId, club.name, club.short_name.toUpperCase(), club.colour_primary, club.colour_secondary, club.attack, club.defence],
    );
    const clubId = result.rows[0].id;
    clubIds.push(clubId);
    clubLeagueIds.set(clubId, leagueId);

    for (let playerIndex = 0; playerIndex < squadPositions.length; playerIndex += 1) {
      const nameOrdinal = index * squadPositions.length + playerIndex;
      const name = `${firstNames[nameOrdinal % firstNames.length]} ${lastNames[Math.floor(nameOrdinal / firstNames.length) % lastNames.length]}`;
      await client.query(
        'INSERT INTO players (club_id, name, position) VALUES ($1, $2, $3)',
        [clubId, name, squadPositions[playerIndex]],
      );
    }
  }

  const fixtures = generateFixtures(clubIds);
  const seasonStart = new Date(`${input.season_start_date ?? new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);
  for (const fixture of fixtures) {
    assertFixtureClubsInLeague(leagueId, fixture.homeClubId, fixture.awayClubId, clubLeagueIds);
    await client.query(
      `INSERT INTO matches (league_id, matchday, home_club_id, away_club_id, scheduled_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [leagueId, fixture.matchday, fixture.homeClubId, fixture.awayClubId,
        new Date(seasonStart.getTime() + (fixture.matchday - 1) * input.matchday_cadence_days * 86_400_000)],
    );
  }

  return { id: leagueId };
}
