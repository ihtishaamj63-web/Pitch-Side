import { createSeededRng, mulberry32 } from '../../src/lib/random';
import {
  applyTactics,
  assignScorers,
  expectedGoals,
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

describe('applyTactics', () => {
  it('adjusts the managed club ratings without mutating its original', () => {
    const club = { id: 9, name: 'Managed', attack: 70, defence: 80 };
    const attacking = applyTactics(club, 'attacking');
    expect(attacking).toMatchObject({ attack: 77, defence: 72 });
    expect(club).toMatchObject({ attack: 70, defence: 80 });
    expect(applyTactics(club, 'balanced')).toMatchObject({ attack: 70, defence: 80 });
    expect(applyTactics(club, 'defensive')).toMatchObject({ attack: 63, defence: 88 });
  });

  it('keeps tactic-adjusted ratings within the simulation range', () => {
    expect(applyTactics({ id: 1, name: 'Strong', attack: 100, defence: 1 }, 'attacking'))
      .toMatchObject({ attack: 100, defence: 1 });
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
    expect(first.yellowCards).toEqual(repeated.yellowCards);
    expect(first.teamStats.map((stats) => stats.possession)).toEqual([first.teamStats[0].possession, 100 - first.teamStats[0].possession]);
    expect(first.teamStats.every((stats) => stats.shotsOnTarget <= stats.shots)).toBe(true);
    expect(first.teamStats.reduce((sum, stats) => sum + stats.xg, 0)).toBeCloseTo(
      first.expectedGoals.home + first.expectedGoals.away,
    );
    expect(first.playerStats).toHaveLength(home.players!.length + away.players!.length);
    expect(first.fouls.length).toBe(first.teamStats.reduce((sum, stats) => sum + stats.fouls, 0));
    first.scorers.forEach((scorer) => {
      expect(scorer.minute).toBeGreaterThanOrEqual(1);
      expect(scorer.minute).toBeLessThanOrEqual(90);
      expect(scorer.clubId === home.id ? [12, 13, 14] : [21]).toContain(scorer.playerId);
      if (scorer.assistPlayerId !== null) {
        expect(scorer.assistPlayerId).not.toBe(scorer.playerId);
        expect(scorer.clubId === home.id ? [12, 13, 14] : [21]).toContain(scorer.assistPlayerId);
      }
    });
    first.yellowCards.forEach((card) => {
      expect(card.minute).toBeGreaterThanOrEqual(1);
      expect(card.minute).toBeLessThanOrEqual(90);
      expect(card.clubId === home.id ? [11, 12, 13, 14] : [21]).toContain(card.playerId);
    });
    first.redCards.forEach((card) => {
      expect(card.minute).toBeGreaterThanOrEqual(1);
      expect(card.minute).toBeLessThanOrEqual(90);
    });
  });
});
