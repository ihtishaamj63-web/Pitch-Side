export interface Fixture {
  matchday: number;
  homeClubId: ClubId;
  awayClubId: ClubId;
}

export type ClubId = string | number;
export type FixtureClub = ClubId | Pick<LeagueClubIdentity, 'id'>;

export interface LeagueClubIdentity {
  id: ClubId;
}

/**
 * Creates a circle-method double round robin. Odd-sized leagues receive a bye
 * each round; byes are omitted from the returned fixtures.
 */
export function generateFixtures(clubs: FixtureClub[]): Fixture[] {
  const clubIds = clubs.map((club) => typeof club === 'object' ? club.id : club);
  if (new Set(clubIds).size !== clubIds.length) {
    throw new Error('Club IDs must be unique');
  }
  if (clubIds.length < 2) return [];

  const clubsWithBye: Array<ClubId | null> = clubIds.slice();
  if (clubsWithBye.length % 2 !== 0) clubsWithBye.push(null);

  const clubCount = clubsWithBye.length;
  const firstLeg: Fixture[] = [];

  for (let roundIndex = 0; roundIndex < clubCount - 1; roundIndex += 1) {
    for (let pairIndex = 0; pairIndex < clubCount / 2; pairIndex += 1) {
      const first = clubsWithBye[pairIndex];
      const second = clubsWithBye[clubCount - 1 - pairIndex];
      if (first === null || second === null) continue;

      const reverseHomeAway = (roundIndex + pairIndex) % 2 === 1;
      firstLeg.push({
        matchday: roundIndex + 1,
        homeClubId: reverseHomeAway ? second : first,
        awayClubId: reverseHomeAway ? first : second,
      });
    }

    const rotatingClubs = clubsWithBye.slice(1);
    rotatingClubs.unshift(rotatingClubs.pop() as ClubId | null);
    clubsWithBye.splice(1, clubsWithBye.length - 1, ...rotatingClubs);
  }

  const secondLeg = firstLeg.map((fixture) => ({
    matchday: fixture.matchday + clubCount - 1,
    homeClubId: fixture.awayClubId,
    awayClubId: fixture.homeClubId,
  }));

  return firstLeg.concat(secondLeg);
}

/** Backwards-compatible name for consumers that describe clubs as teams. */
export const generateDoubleRoundRobin = generateFixtures;

/**
 * Throws when either club is absent from the league or belongs to another league.
 * The map is keyed by club ID and stores each club's league ID.
 */
export function assertFixtureClubsInLeague(
  leagueId: ClubId,
  homeClubId: ClubId,
  awayClubId: ClubId,
  clubLeagueIds: ReadonlyMap<ClubId, ClubId> | { [clubId: string]: ClubId },
): void {
  const map = clubLeagueIds as ReadonlyMap<ClubId, ClubId>;
  const lookup = (clubId: ClubId): ClubId | undefined =>
    typeof map.get === 'function'
      ? map.get(clubId)
      : (clubLeagueIds as { [clubId: string]: ClubId })[clubId];
  const homeLeagueId = lookup(homeClubId);
  const awayLeagueId = lookup(awayClubId);
  if (homeLeagueId !== leagueId || awayLeagueId !== leagueId) {
    throw new Error('Fixture clubs must both belong to the specified league');
  }
  if (homeClubId === awayClubId) {
    throw new Error('A club cannot play against itself');
  }
}
