import { assertFixtureClubsInLeague, ClubId, generateFixtures } from '../../src/lib/league';

describe('generateFixtures', () => {
  it('creates a home-and-away fixture for every pair in an even league', () => {
    const fixtures = generateFixtures([
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
    ]);
    expect(fixtures).toHaveLength(12);
    expect(Object.keys(fixtures[0]).sort()).toEqual(['awayClubId', 'homeClubId', 'matchday']);

    for (let first = 0; first < 4; first += 1) {
      for (let second = first + 1; second < 4; second += 1) {
        const meetings = fixtures.filter(
          (fixture) =>
            (fixture.homeClubId === ['a', 'b', 'c', 'd'][first] &&
              fixture.awayClubId === ['a', 'b', 'c', 'd'][second]) ||
            (fixture.homeClubId === ['a', 'b', 'c', 'd'][second] &&
              fixture.awayClubId === ['a', 'b', 'c', 'd'][first]),
        );
        expect(meetings).toHaveLength(2);
        expect(meetings[0].homeClubId).toBe(meetings[1].awayClubId);
        expect(meetings[0].awayClubId).toBe(meetings[1].homeClubId);
      }
    }
    expect(new Set(fixtures.map((fixture) => fixture.matchday)).size).toBe(6);
    expect(fixtures.every((fixture) => fixture.matchday >= 1 && fixture.matchday <= 6)).toBe(true);
  });

  it('handles odd team counts with one bye per team and no bye fixtures', () => {
    const fixtures = generateFixtures(['a', 'b', 'c']);
    expect(fixtures).toHaveLength(6);
    expect(new Set(fixtures.map((fixture) => fixture.matchday)).size).toBe(6);

    ['a', 'b', 'c'].forEach((clubId) => {
      expect(fixtures.filter((fixture) => fixture.homeClubId === clubId || fixture.awayClubId === clubId))
        .toHaveLength(4);
    });
  });

  it('generates complete double round robins for four and five clubs', () => {
    [4, 5].forEach((count) => {
      const ids = Array.from({ length: count }, (_unused, index) => index + 1);
      const fixtures = generateFixtures(ids);
      expect(fixtures).toHaveLength(count * (count - 1));
      expect(new Set(fixtures.map((fixture) => fixture.matchday)).size)
        .toBe((count % 2 === 0 ? count - 1 : count) * 2);

      for (let home = 1; home <= count; home += 1) {
        for (let away = home + 1; away <= count; away += 1) {
          expect(fixtures.filter((fixture) =>
            fixture.homeClubId === home && fixture.awayClubId === away,
          )).toHaveLength(1);
          expect(fixtures.filter((fixture) =>
            fixture.homeClubId === away && fixture.awayClubId === home,
          )).toHaveLength(1);
        }
      }
    });
  });

  it('gives every club one bye per leg in a five-club double round robin', () => {
    const ids = [1, 2, 3, 4, 5];
    const fixtures = generateFixtures(ids);
    expect(fixtures).toHaveLength(20);

    for (let matchday = 1; matchday <= 10; matchday += 1) {
      const matchdayFixtures = fixtures.filter((fixture) => fixture.matchday === matchday);
      expect(matchdayFixtures).toHaveLength(2);
      expect(new Set(matchdayFixtures.flatMap((fixture) => [fixture.homeClubId, fixture.awayClubId])).size)
        .toBe(4);
    }
    ids.forEach((clubId) => {
      expect(fixtures.filter((fixture) =>
        fixture.homeClubId === clubId || fixture.awayClubId === clubId,
      )).toHaveLength(8);
    });
  });

  it('returns no fixtures for fewer than two clubs and rejects duplicate IDs', () => {
    expect(generateFixtures([])).toEqual([]);
    expect(generateFixtures(['only-club'])).toEqual([]);
    expect(() => generateFixtures(['a', 'a'])).toThrow('Club IDs must be unique');
  });

  it('rejects a fixture whose clubs do not both belong to the requested league', () => {
    const leagueByClubId = new Map<ClubId, ClubId>([
      ['home', 'league-1'],
      ['away', 'league-2'],
    ]);

    expect(() =>
      assertFixtureClubsInLeague('league-1', 'home', 'away', leagueByClubId),
    ).toThrow('Fixture clubs must both belong to the specified league');
    expect(() =>
      assertFixtureClubsInLeague('league-1', 'home', 'home', leagueByClubId),
    ).toThrow('A club cannot play against itself');
  });
});
