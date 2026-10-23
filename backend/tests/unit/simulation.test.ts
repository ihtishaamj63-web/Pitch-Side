import { createSeededRng, mulberry32 } from '../../src/lib/random';
import { computeTable } from '../../src/lib/standings';
import {
  assignScorers,
  expectedGoals,
  runForecast,
  samplePoisson,
  simulateMatch,
  SimulationClub,
  SimulationPlayer,
} from '../../src/lib/simulation';

const home: SimulationClub = {
  id: 1,
  name: 'Home',
  attack: 2,
  defence: 1,
  players: [
    { id: 11, name: 'Keeper', position: 'GK' },
    { id: 12, name: 'Defender', position: 'DEF' },
    { id: 13, name: 'Midfielder', position: 'MID' },
    { id: 14, name: 'Striker', position: 'FWD' },
  ],
};
const away: SimulationClub = {
  id: 2,
  name: 'Away',
  attack: 1,
  defence: 2,
  players: [{ id: 21, name: 'Forward', position: 'FWD' }],
};

describe('expectedGoals', () => {
  it('uses the defaults and specified home/away formulas', () => {
    const result = expectedGoals(home, away);
    expect(result).toEqual({
      home: 1.35 * 1.15 * (home.attack / away.defence),
      away: 1.35 / 1.15 * (away.attack / home.defence),
    });
  });

  it('clamps both lambdas to the default lower and upper bounds', () => {
    expect(expectedGoals(
      { ...home, attack: 1000 },
      { ...away, defence: 1 },
    ).home).toBe(4.5);
    expect(expectedGoals(
      { ...home, attack: 0.001 },
      { ...away, defence: 100 },
    ).home).toBe(0.15);
    expect(expectedGoals(
      { ...home, defence: 100 },
      { ...away, attack: 0.001 },
    ).away).toBe(0.15);
    expect(expectedGoals(
      { ...home, defence: 1 },
      { ...away, attack: 1000 },
    ).away).toBe(4.5);
  });
});

describe('samplePoisson', () => {
  it('handles zero and deterministic seeded samples', () => {
    expect(samplePoisson(0, () => 0.5)).toBe(0);
    expect(samplePoisson(1, () => 0.5)).toBe(1);
    expect(samplePoisson(2, createSeededRng(10))).toBe(samplePoisson(2, createSeededRng(10)));
    expect(() => samplePoisson(-1, () => 0.5)).toThrow();
  });

  it('has a sample mean within three percent of lambda over 20,000 samples', () => {
    const rng = mulberry32(2026);
    const lambda = 1.4;
    let total = 0;
    const samples = 20000;
    for (let index = 0; index < samples; index += 1) {
      total += samplePoisson(lambda, rng);
    }
    expect(Math.abs(total / samples - lambda) / lambda).toBeLessThan(0.03);
  });
});

describe('scorer assignment and match simulation', () => {
  it('assigns the requested number of goals, excludes keepers, and sorts minutes', () => {
    const squad: SimulationPlayer[] = [
      { id: 1, name: 'Keeper', position: 'GK' },
      { id: 2, name: 'Defender', position: 'DEF' },
      { id: 3, name: 'Midfielder', position: 'MID' },
      { id: 4, name: 'Forward', position: 'FWD' },
    ];
    const scorers = assignScorers(100, squad, createSeededRng(15), 8);
    expect(scorers).toHaveLength(100);
    expect(scorers.every((scorer) => scorer.playerId !== 1)).toBe(true);
    expect(scorers.map((scorer) => scorer.minute)).toEqual(
      scorers.map((scorer) => scorer.minute).slice().sort((a, b) => a - b),
    );
    expect(scorers.every((scorer) => scorer.minute >= 1 && scorer.minute <= 90)).toBe(true);
    expect(scorers.every((scorer) => scorer.clubId === 8)).toBe(true);
  });

  it('throws rather than silently dropping goals when a squad has no eligible scorer', () => {
    expect(() => assignScorers(
      1,
      [{ id: 1, name: 'Keeper', position: 'GK' }],
      createSeededRng(3),
      8,
    )).toThrow('Cannot assign goals without an eligible non-goalkeeper player');
    expect(assignScorers(0, [{ id: 1, name: 'Keeper', position: 'GK' }], createSeededRng(3)))
      .toEqual([]);
  });

  it('uses position weights GK 0, DEF 1, MID 3, and FWD 5', () => {
    const squad: SimulationPlayer[] = [
      { id: 1, name: 'Keeper', position: 'GK' },
      { id: 2, name: 'Defender', position: 'DEF' },
      { id: 3, name: 'Midfielder', position: 'MID' },
      { id: 4, name: 'Forward', position: 'FWD' },
    ];
    const randomValues = [0, 0, 0.2, 0, 0.5, 0];
    let index = 0;
    const scorers = assignScorers(3, squad, () => randomValues[index++], 8);
    expect(scorers.map((scorer) => scorer.playerId)).toEqual([2, 3, 4]);
  });

  it('simulates deterministically and attaches scorers to the relevant club/player', () => {
    const first = simulateMatch(home, away, createSeededRng(77));
    const repeated = simulateMatch(home, away, createSeededRng(77));
    expect(first).toEqual(repeated);
    expect(first.scorers).toHaveLength(first.homeGoals + first.awayGoals);
    first.scorers.forEach((scorer) => {
      expect(scorer.minute).toBeGreaterThanOrEqual(1);
      expect(scorer.minute).toBeLessThanOrEqual(90);
      expect(scorer.clubId === home.id ? [12, 13, 14] : [21]).toContain(scorer.playerId);
    });
  });
});

describe('runForecast', () => {
  it('is deterministic, uses current results, and returns normalized position and zone probabilities', () => {
    const input = {
      clubs: [home, away],
      results: [{ homeClubId: 1, awayClubId: 2, homeGoals: 2, awayGoals: 0 }],
      remainingFixtures: [],
      runs: 25,
      seed: 10,
      topZone: 1,
      bottomZone: 1,
    };
    const forecast = runForecast(input);
    expect(runForecast(input)).toEqual(forecast);
    expect(forecast[0]).toEqual({
      clubId: 1,
      positionProbabilities: { 1: 1, 2: 0 },
      titleProbability: 1,
      topZoneProbability: 1,
      bottomZoneProbability: 0,
    });
    expect(forecast[1].positionProbabilities).toEqual({ 1: 0, 2: 1 });
    forecast.forEach((row) => {
      expect(Object.values(row.positionProbabilities).reduce((sum, value) => sum + value, 0)).toBe(1);
    });
  });

  it('uses the seed deterministically for forecasts with remaining fixtures', () => {
    const input = {
      clubs: [home, away],
      results: [],
      remainingFixtures: [{ matchday: 1, homeClubId: 1, awayClubId: 2 }],
      runs: 30,
      seed: 912,
    };
    expect(runForecast(input)).toEqual(runForecast(input));
  });

  it('forecasts scores without requiring player squads', () => {
    const forecast = runForecast({
      clubs: [
        { id: 1, name: 'Home', attack: 70, defence: 65 },
        { id: 2, name: 'Away', attack: 60, defence: 75 },
      ],
      results: [],
      remainingFixtures: [{ matchday: 1, homeClubId: 1, awayClubId: 2 }],
      runs: 10,
      seed: 2026,
    });

    expect(forecast).toHaveLength(2);
    expect(forecast.every((row) => Object.values(row.positionProbabilities)
      .reduce((sum, probability) => sum + probability, 0) === 1)).toBe(true);
  });

  it('returns a clinched title and exact final table for a completed season', () => {
    const clubs = [home, away];
    const results = [
      { homeClubId: 1, awayClubId: 2, homeGoals: 3, awayGoals: 0 },
      { homeClubId: 2, awayClubId: 1, homeGoals: 1, awayGoals: 1 },
    ];
    const standings = computeTable(clubs, results);
    const forecast = runForecast({
      clubs,
      results,
      remainingFixtures: [],
      runs: 5,
      seed: 2,
      rules: { pointsWin: 5, pointsDraw: 2 },
      topZone: 1,
      bottomZone: 1,
    });
    expect(standings[0].clubId).toBe(1);
    expect(forecast[0].titleProbability).toBe(1);
    expect(forecast.find((row) => row.clubId === standings[0].clubId)?.positionProbabilities)
      .toEqual({ 1: 1, 2: 0 });
  });

  it('honours custom points rules and caps run count at 50,000', () => {
    const rows = computeTable(
      [home, away],
      [{ homeClubId: 1, awayClubId: 2, homeGoals: 0, awayGoals: 0 }],
      { pointsWin: 5, pointsDraw: 4 },
    );
    expect(rows.every((row) => row.points === 4)).toBe(true);
    expect(() => runForecast({
      clubs: [home, away],
      results: [],
      remainingFixtures: [],
      runs: 50001,
      seed: 1,
    })).toThrow('Forecast runs must be an integer between 1 and 50000');
  });

  it('accepts zero top and bottom zone sizes', () => {
    const forecast = runForecast({
      clubs: [home, away],
      results: [],
      remainingFixtures: [],
      runs: 1,
      seed: 3,
      topZone: 0,
      bottomZone: 0,
    });
    expect(forecast.every((row) =>
      row.topZoneProbability === 0 && row.bottomZoneProbability === 0,
    )).toBe(true);
  });
});
