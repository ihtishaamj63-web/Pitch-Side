import { mulberry32 } from '../../src/lib/random';
import {
  applyTactics,
  assignScorers,
  calculateExpectedGoals,
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

describe('calculateExpectedGoals', () => {
  it('uses the defaults and specified home/away formulas', () => {
    const result = calculateExpectedGoals(home, away);
    expect(result).toEqual({
      home: 1.35 * 1.15 * (home.attack / away.defence),
      away: 1.35 / 1.15 * (away.attack / home.defence),
    });
  });

  it('clamps both lambdas to the default lower and upper bounds', () => {
    expect(calculateExpectedGoals(
      { ...home, attack: 1000 },
      { ...away, defence: 1 },
    ).home).toBe(4.5);
    expect(calculateExpectedGoals(
      { ...home, attack: 0.001 },
      { ...away, defence: 100 },
    ).home).toBe(0.15);
    expect(calculateExpectedGoals(
      { ...home, defence: 100 },
      { ...away, attack: 0.001 },
    ).away).toBe(0.15);
    expect(calculateExpectedGoals(
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
    expect(samplePoisson(2, mulberry32(10))).toBe(samplePoisson(2, mulberry32(10)));
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
  const makeEleven = (clubId: number): SimulationPlayer[] => [
    { id: clubId * 100 + 1, name: `Keeper ${clubId}`, position: 'GK' },
    ...Array.from({ length: 4 }, (_, index) => ({ id: clubId * 100 + 2 + index, name: `Defender ${clubId}-${index}`, position: 'DEF' })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: clubId * 100 + 6 + index, name: `Midfielder ${clubId}-${index}`, position: 'MID' })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: clubId * 100 + 10 + index, name: `Forward ${clubId}-${index}`, position: 'FWD' })),
  ];

  it('assigns the requested number of goals, excludes keepers, and sorts minutes', () => {
    const squad: SimulationPlayer[] = [
      { id: 1, name: 'Keeper', position: 'GK' },
      { id: 2, name: 'Defender', position: 'DEF' },
      { id: 3, name: 'Midfielder', position: 'MID' },
      { id: 4, name: 'Forward', position: 'FWD' },
    ];
    const scorers = assignScorers(100, squad, mulberry32(15), 8);
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
      mulberry32(3),
      8,
    )).toThrow('Cannot assign goals without an eligible non-goalkeeper player');
    expect(assignScorers(0, [{ id: 1, name: 'Keeper', position: 'GK' }], mulberry32(3)))
      .toEqual([]);
  });

  it('uses position weights GK 0, DEF 1, MID 3, and FWD 5', () => {
    const squad: SimulationPlayer[] = [
      { id: 1, name: 'Keeper', position: 'GK' },
      { id: 2, name: 'Defender', position: 'DEF' },
      { id: 3, name: 'Midfielder', position: 'MID' },
      { id: 4, name: 'Forward', position: 'FWD' },
    ];
    const randomValues = [0, 0, 0, 0.2, 0, 0.5];
    let index = 0;
    const scorers = assignScorers(3, squad, () => randomValues[index++], 8);
    expect(scorers.map((scorer) => scorer.playerId)).toEqual([2, 3, 4]);
  });

  it('simulates deterministically and attaches scorers to the relevant club/player', () => {
    const first = simulateMatch(home, away, mulberry32(77));
    const repeated = simulateMatch(home, away, mulberry32(77));
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

  it('records an XI, used substitutes, and participant minutes for each full squad', () => {
    const makeSquad = (clubId: number | string): SimulationPlayer[] => {
      const base = Number(clubId) * 100;
      return [
      { id: base + 1, name: 'Keeper', position: 'GK' },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: base + 2 + index,
        name: `Defender ${index + 1}`,
        position: 'DEF',
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: base + 6 + index,
        name: `Midfielder ${index + 1}`,
        position: 'MID',
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: base + 11 + index,
        name: `Forward ${index + 1}`,
        position: 'FWD',
      })),
      ];
    };
    const result = simulateMatch(
      { ...home, players: makeSquad(home.id) },
      { ...away, players: makeSquad(away.id) },
      mulberry32(2026),
    );

    for (const club of [home, away]) {
      const clubStats = result.playerStats.filter(stats => stats.clubId === club.id);
      expect(clubStats.filter(stats => stats.isStarter)).toHaveLength(11);
      const substitutions = result.substitutions.filter(substitution => substitution.clubId === club.id);
      expect(substitutions).toHaveLength(3);

      for (const substitution of substitutions) {
        const playerOff = clubStats.find(stats => stats.playerId === substitution.playerOffId);
        const playerOn = clubStats.find(stats => stats.playerId === substitution.playerOnId);
        expect(playerOff?.isStarter).toBe(true);
        expect(playerOff?.minutesPlayed).toBe(substitution.minute);
        expect(playerOn?.isStarter).toBe(false);
        expect(playerOn?.minutesPlayed).toBeLessThanOrEqual(90 - substitution.minute);
      }

      result.scorers.filter(scorer => scorer.clubId === club.id).forEach(scorer => {
        const player = clubStats.find(stats => stats.playerId === scorer.playerId);
        expect(player).toBeDefined();
        const substitutionOn = result.substitutions.find(substitution => substitution.playerOnId === scorer.playerId);
        const substitutionOff = result.substitutions.find(substitution => substitution.playerOffId === scorer.playerId);
        const startedAt = substitutionOn?.minute ?? 0;
        expect(scorer.minute).toBeGreaterThanOrEqual(startedAt);
        const redCard = result.redCards.find(card => card.playerId === scorer.playerId);
        const endedAt = substitutionOff?.minute ?? redCard?.minute;
        if (endedAt !== undefined) expect(scorer.minute).toBeLessThan(endedAt);
        else expect(scorer.minute).toBeLessThanOrEqual(90);
      });
    }
  });

  it('calibrates seeded results and keeps all shot-derived statistics coherent', () => {
    const balancedHome: SimulationClub = { id: 91, name: 'Balanced Home', attack: 70, defence: 70, players: makeEleven(91) };
    const balancedAway: SimulationClub = { id: 92, name: 'Balanced Away', attack: 70, defence: 70, players: makeEleven(92) };
    const stronger: SimulationClub = { id: 93, name: 'Stronger', attack: 92, defence: 92, players: makeEleven(93) };
    const weaker: SimulationClub = { id: 94, name: 'Weaker', attack: 48, defence: 48, players: makeEleven(94) };
    let totalGoals = 0;
    let homeWins = 0;
    let awayWins = 0;
    let strongerWins = 0;
    const runs = 2_000;

    for (let seed = 1; seed <= runs; seed += 1) {
      const result = simulateMatch(balancedHome, balancedAway, mulberry32(seed));
      totalGoals += result.homeGoals + result.awayGoals;
      if (result.homeGoals > result.awayGoals) homeWins += 1;
      if (result.homeGoals < result.awayGoals) awayWins += 1;
      for (const [index, stats] of result.teamStats.entries()) {
        const opponentStats = result.teamStats[1 - index];
        const goals = index === 0 ? result.homeGoals : result.awayGoals;
        const opponentGoals = index === 0 ? result.awayGoals : result.homeGoals;
        expect(goals).toBeLessThanOrEqual(stats.shotsOnTarget);
        expect(stats.shotsOnTarget).toBeLessThanOrEqual(stats.shots);
        expect(stats.saves + opponentGoals).toBe(opponentStats.shotsOnTarget);
        const shotXg = result.events
          .filter((event) => event.clubId === stats.clubId && event.type === 'chance')
          .reduce((sum, event) => sum + Number(event.payload.xg ?? 0), 0);
        expect(stats.xg).toBeCloseTo(shotXg, 8);
      }
      expect(result.events[0].type).toBe('kickoff');
      expect(result.events[result.events.length - 1].type).toBe('full_time');
      expect(result.events.map((event) => event.seq)).toEqual(result.events.map((_, index) => index + 1));
    }

    const meanGoals = totalGoals / runs;
    expect(meanGoals).toBeGreaterThanOrEqual(2.4);
    expect(meanGoals).toBeLessThanOrEqual(2.9);
    expect(homeWins / runs).toBeGreaterThan(0.33);
    expect(homeWins).toBeGreaterThan(awayWins);

    for (let seed = 1; seed <= 600; seed += 1) {
      const result = simulateMatch(stronger, weaker, mulberry32(seed));
      if (result.homeGoals > result.awayGoals) strongerWins += 1;
    }
    expect(strongerWins / 600).toBeGreaterThan(0.65);
  });

  it('keeps player actions inside their time on the pitch', () => {
    const makeSquadWithBench = (clubId: number): SimulationPlayer[] => [
      ...makeEleven(clubId),
      ...Array.from({ length: 3 }, (_, index) => ({
        id: clubId * 100 + 20 + index,
        name: `Bench defender ${clubId}-${index}`,
        position: 'DEF',
      })),
    ];
    const result = simulateMatch(
      { id: 95, name: 'Home XI', attack: 70, defence: 70, players: makeSquadWithBench(95) },
      { id: 96, name: 'Away XI', attack: 70, defence: 70, players: makeSquadWithBench(96) },
      mulberry32(45),
    );

    for (const event of result.events) {
      if (event.playerId === null || !['chance', 'goal', 'save', 'foul', 'yellow', 'red'].includes(event.type)) continue;
      const substitutionOn = result.substitutions.find((substitution) => substitution.playerOnId === event.playerId);
      const substitutionOff = result.substitutions.find((substitution) => substitution.playerOffId === event.playerId);
      const redCard = result.redCards.find((card) => card.playerId === event.playerId);
      const startedAt = substitutionOn?.minute ?? 0;
      const endedAt = substitutionOff?.minute ?? redCard?.minute;
      expect(event.minute).toBeGreaterThanOrEqual(startedAt);
      if (endedAt !== undefined) {
        expect(event.minute < endedAt || (event.type === 'red' && event.minute === endedAt)).toBe(true);
      }
    }
  });
});
