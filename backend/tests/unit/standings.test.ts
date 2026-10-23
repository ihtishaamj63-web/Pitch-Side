import { computeTable, Club, PlayedMatch } from '../../src/lib/standings';

const clubs: Club[] = [
  { id: 'a', name: 'Alpha', attack: 1, defence: 1 },
  { id: 'b', name: 'Bravo', attack: 1, defence: 1 },
  { id: 'c', name: 'Charlie', attack: 1, defence: 1 },
];

describe('computeTable', () => {
  it('calculates played, W/D/L, goals, goal difference, points, and form', () => {
    const matches: PlayedMatch[] = [
      { homeClubId: 'a', awayClubId: 'b', homeGoals: 2, awayGoals: 0 },
      { homeClubId: 'c', awayClubId: 'a', homeGoals: 1, awayGoals: 0 },
      { homeClubId: 'b', awayClubId: 'c', homeGoals: 1, awayGoals: 1 },
    ];

    const table = computeTable(clubs, matches);
    expect(table).toEqual([
      expect.objectContaining({
        clubId: 'c', clubName: 'Charlie', played: 2, won: 1, drawn: 1, lost: 0,
        goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 4, form: 'WD', position: 1,
      }),
      expect.objectContaining({
        clubId: 'a', clubName: 'Alpha', played: 2, won: 1, drawn: 0, lost: 1,
        goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 3, form: 'WL', position: 2,
      }),
      expect.objectContaining({
        clubId: 'b', clubName: 'Bravo', played: 2, won: 0, drawn: 1, lost: 1,
        goalsFor: 1, goalsAgainst: 3, goalDifference: -2, points: 1, form: 'LD', position: 3,
      }),
    ]);
  });

  it('uses goal difference, goals scored, then name as tiebreakers', () => {
    const tiedClubs: Club[] = [
      { id: 'z', name: 'Zulu', attack: 1, defence: 1 },
      { id: 'b', name: 'Bravo', attack: 1, defence: 1 },
      { id: 'a', name: 'Alpha', attack: 1, defence: 1 },
    ];
    const matches: PlayedMatch[] = [
      { homeClubId: 'a', awayClubId: 'b', homeGoals: 1, awayGoals: 0 },
      { homeClubId: 'b', awayClubId: 'z', homeGoals: 2, awayGoals: 0 },
      { homeClubId: 'z', awayClubId: 'a', homeGoals: 1, awayGoals: 0 },
    ];

    expect(computeTable(tiedClubs, matches).map((club) => club.clubId)).toEqual(['b', 'a', 'z']);
  });

  it('compares goals scored before names when points and goal difference are equal', () => {
    const scoredClubs: Club[] = [
      { id: 'two-alpha', name: 'Zulu', attack: 1, defence: 1 },
      { id: 'one-alpha', name: 'Alpha', attack: 1, defence: 1 },
      { id: 'two-bravo', name: 'Bravo', attack: 1, defence: 1 },
      { id: 'one-charlie', name: 'Charlie', attack: 1, defence: 1 },
      { id: 'opponent-a', name: 'Opponent A', attack: 1, defence: 1 },
      { id: 'opponent-b', name: 'Opponent B', attack: 1, defence: 1 },
      { id: 'opponent-c', name: 'Opponent C', attack: 1, defence: 1 },
      { id: 'opponent-d', name: 'Opponent D', attack: 1, defence: 1 },
    ];
    const matches: PlayedMatch[] = [
      { homeClubId: 'two-alpha', awayClubId: 'opponent-a', homeGoals: 2, awayGoals: 1 },
      { homeClubId: 'one-alpha', awayClubId: 'opponent-b', homeGoals: 1, awayGoals: 0 },
      { homeClubId: 'two-bravo', awayClubId: 'opponent-c', homeGoals: 2, awayGoals: 1 },
      { homeClubId: 'one-charlie', awayClubId: 'opponent-d', homeGoals: 1, awayGoals: 0 },
    ];

    expect(computeTable(scoredClubs, matches).slice(0, 4).map((club) => club.clubId)).toEqual([
      'two-bravo',
      'two-alpha',
      'one-alpha',
      'one-charlie',
    ]);
  });

  it('breaks complete ties by club name without regard to case', () => {
    const tiedClubs: Club[] = [
      { id: 4, name: 'bravo', attack: 1, defence: 1 },
      { id: 2, name: 'Alpha', attack: 1, defence: 1 },
      { id: 3, name: 'alpha', attack: 1, defence: 1 },
      { id: 1, name: 'Charlie', attack: 1, defence: 1 },
    ];
    expect(computeTable(tiedClubs, []).map((club) => club.clubId)).toEqual([2, 3, 4, 1]);
  });

  it('awards draw-only tables the configured draw points', () => {
    const table = computeTable(
      clubs.slice(0, 2),
      [{ homeClubId: 'a', awayClubId: 'b', homeGoals: 0, awayGoals: 0 }],
    );
    expect(table.map((club) => [club.played, club.won, club.drawn, club.lost, club.points]))
      .toEqual([[1, 0, 1, 0, 1], [1, 0, 1, 0, 1]]);
  });

  it('keeps only the latest five results in form and validates match data', () => {
    const matches: PlayedMatch[] = Array.from({ length: 6 }, () => ({
      homeClubId: 'a', awayClubId: 'b', homeGoals: 1, awayGoals: 0,
    }));
    expect(computeTable(clubs, matches)[0].form).toBe('WWWWW');
    expect(() =>
      computeTable(clubs, [{ homeClubId: 'missing', awayClubId: 'b', homeGoals: 0, awayGoals: 0 }]),
    ).toThrow('Match references an unknown club');
    expect(() =>
      computeTable(clubs, [{ homeClubId: 'a', awayClubId: 'b', homeGoals: -1, awayGoals: 0 }]),
    ).toThrow('Match goals must be non-negative integers');
  });

  it('orders form by matchday when all matchdays are available', () => {
    const matches: PlayedMatch[] = [
      { homeClubId: 'a', awayClubId: 'b', homeGoals: 0, awayGoals: 1, matchday: 2 },
      { homeClubId: 'a', awayClubId: 'c', homeGoals: 1, awayGoals: 0, matchday: 1 },
    ];

    expect(computeTable(clubs, matches).find((club) => club.clubId === 'a')?.form).toBe('WL');
  });
});
