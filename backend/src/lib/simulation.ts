import { ClubId, Fixture } from './league';
import { mulberry32, RandomSource } from './random';
import { computeTable, Club, PlayedMatch, TableRow, TableRules } from './standings';

export interface SimulationPlayer {
  id: ClubId;
  name: string;
  position: string;
  clubId?: ClubId;
}

export interface SimulationClub extends Club {
  players?: SimulationPlayer[];
}

export type SquadPlayer = SimulationPlayer;

export interface ExpectedGoals {
  home: number;
  away: number;
}

export interface GoalScorer {
  clubId: ClubId;
  playerId: ClubId;
  playerName: string;
  minute: number;
}

export interface SimulatedMatch extends PlayedMatch {
  scorers: GoalScorer[];
  expectedGoals: ExpectedGoals;
}

export interface ForecastOptions {
  runs?: number;
  seed?: number;
  topZone?: number;
  bottomZone?: number;
  rules?: Partial<TableRules>;
}

export interface ForecastResult {
  clubId: ClubId;
  positionProbabilities: Record<number, number>;
  titleProbability: number;
  topZoneProbability: number;
  bottomZoneProbability: number;
}

export type TeamForecast = ForecastResult;
export type SeasonForecast = ForecastResult[];

export interface ExpectedGoalsParameters {
  baseGoals?: number;
  homeAdv?: number;
}

export type ExpectedGoalsOptions = ExpectedGoalsParameters;

const DEFAULT_EXPECTED_GOALS: Required<ExpectedGoalsParameters> = {
  baseGoals: 1.35,
  homeAdv: 1.15,
};
const MIN_EXPECTED_GOALS = 0.15;
const MAX_EXPECTED_GOALS = 4.5;

function positiveRating(rating: number, description: string): void {
  if (!Number.isFinite(rating) || rating <= 0) {
    throw new Error(`${description} must be a finite number greater than zero`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Calculates xG using attack/defence multipliers and a home-field adjustment. */
export function calculateExpectedGoals(
  homeClub: Club,
  awayClub: Club,
  params: ExpectedGoalsParameters = {},
): ExpectedGoals {
  positiveRating(homeClub.attack, 'Home attack rating');
  positiveRating(homeClub.defence, 'Home defence rating');
  positiveRating(awayClub.attack, 'Away attack rating');
  positiveRating(awayClub.defence, 'Away defence rating');

  const settings = { ...DEFAULT_EXPECTED_GOALS, ...params };
  if (
    !Number.isFinite(settings.homeAdv) ||
    settings.homeAdv <= 0 ||
    !Number.isFinite(settings.baseGoals) ||
    settings.baseGoals < 0
  ) {
    throw new Error('Expected-goals options are invalid');
  }

  return {
    home: clamp(
      settings.baseGoals * settings.homeAdv * (homeClub.attack / awayClub.defence),
      MIN_EXPECTED_GOALS,
      MAX_EXPECTED_GOALS,
    ),
    away: clamp(
      settings.baseGoals / settings.homeAdv * (awayClub.attack / homeClub.defence),
      MIN_EXPECTED_GOALS,
      MAX_EXPECTED_GOALS,
    ),
  };
}

export const expectedGoals = calculateExpectedGoals;

/** Samples a Poisson-distributed count with Knuth's algorithm. */
export function samplePoisson(lambda: number, rng: RandomSource): number {
  if (!Number.isFinite(lambda) || lambda < 0) {
    throw new Error('Poisson lambda must be a finite non-negative number');
  }
  if (lambda === 0) return 0;
  if (lambda > 30) {
    const chunks = Math.ceil(lambda / 30);
    let total = 0;
    for (let index = 0; index < chunks; index += 1) {
      total += samplePoisson(lambda / chunks, rng);
    }
    return total;
  }

  const threshold = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    const draw = rng();
    product *= draw === 0 ? Number.MIN_VALUE : draw;
    count += 1;
  } while (product > threshold);
  return count - 1;
}

function positionWeight(position: string): number {
  switch (position.toUpperCase()) {
    case 'GK':
    case 'GOALKEEPER':
      return 0;
    case 'DEF':
    case 'DEFENDER':
      return 1;
    case 'MID':
    case 'MIDFIELDER':
      return 3;
    case 'FWD':
    case 'FORWARD':
    case 'STRIKER':
      return 5;
    default:
      return 0;
  }
}

export function assignScorers(
  goals: number,
  squad: SimulationPlayer[],
  rng: RandomSource,
  clubId?: ClubId,
): GoalScorer[] {
  if (!Number.isInteger(goals) || goals < 0) {
    throw new Error('Goal count must be a non-negative integer');
  }
  const eligible = squad
    .map((player) => ({ player, weight: positionWeight(player.position) }))
    .filter((entry) => entry.weight > 0);
  if (goals > 0 && eligible.length === 0) {
    throw new Error('Cannot assign goals without an eligible non-goalkeeper player');
  }
  const scorers: GoalScorer[] = [];
  for (let index = 0; index < goals; index += 1) {
    const totalWeight = eligible.reduce((total, entry) => total + entry.weight, 0);
    let selection = rng() * totalWeight;
    let selected = eligible[eligible.length - 1].player;
    for (let candidate = 0; candidate < eligible.length; candidate += 1) {
      selection -= eligible[candidate].weight;
      if (selection < 0) {
        selected = eligible[candidate].player;
        break;
      }
    }
    scorers.push({
      clubId: clubId === undefined ? selected.clubId ?? selected.id : clubId,
      playerId: selected.id,
      playerName: selected.name,
      minute: Math.floor(rng() * 90) + 1,
    });
  }
  return scorers.sort((left, right) => left.minute - right.minute);
}

/** Simulates a match score and assigns weighted scorers with minute values. */
export function simulateMatch(
  homeClub: SimulationClub,
  awayClub: SimulationClub,
  rng: RandomSource,
  params: ExpectedGoalsParameters = {},
): SimulatedMatch {
  if (homeClub.id === awayClub.id) throw new Error('A club cannot play against itself');
  const xg = calculateExpectedGoals(homeClub, awayClub, params);
  const homeGoals = samplePoisson(xg.home, rng);
  const awayGoals = samplePoisson(xg.away, rng);
  const scorers = assignScorers(homeGoals, homeClub.players || [], rng, homeClub.id)
    .concat(assignScorers(awayGoals, awayClub.players || [], rng, awayClub.id))
    .sort((left, right) => left.minute - right.minute);

  return {
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    homeGoals,
    awayGoals,
    scorers,
    expectedGoals: xg,
  };
}

/**
 * Monte Carlo season forecast from completed results and remaining fixtures.
 * One injected RNG stream is consumed across all runs for reproducibility.
 */
export interface RunForecastInput {
  clubs: SimulationClub[];
  results: PlayedMatch[];
  remainingFixtures: Fixture[];
  rules?: Partial<TableRules>;
  runs?: number;
  seed?: number;
  topZone?: number;
  bottomZone?: number;
}

export function runForecast(input: RunForecastInput): ForecastResult[] {
  const {
    clubs,
    results: playedMatches,
    remainingFixtures,
    rules,
  } = input;
  const rng = mulberry32(input.seed === undefined ? 1 : input.seed);
  const runs = input.runs === undefined ? 10000 : input.runs;
  const topN = input.topZone === undefined ? 4 : input.topZone;
  const bottomN = input.bottomZone === undefined ? 3 : input.bottomZone;
  if (!Number.isInteger(runs) || runs < 1 || runs > 50000) {
    throw new Error('Forecast runs must be an integer between 1 and 50000');
  }
  if (!Number.isInteger(topN) || topN < 0 || !Number.isInteger(bottomN) || bottomN < 0) {
    throw new Error('Top and bottom places must be non-negative integers');
  }

  const clubById = new Map<ClubId, SimulationClub>();
  clubs.forEach((club) => {
    if (clubById.has(club.id)) throw new Error(`Duplicate club ID: ${club.id}`);
    clubById.set(club.id, club);
  });
  remainingFixtures.forEach((fixture) => {
    if (!clubById.has(fixture.homeClubId) || !clubById.has(fixture.awayClubId)) {
      throw new Error('Fixture references an unknown club');
    }
  });

  const positionCounts = new Map<ClubId, Record<number, number>>();
  const titleCounts = new Map<ClubId, number>();
  const topCounts = new Map<ClubId, number>();
  const bottomCounts = new Map<ClubId, number>();
  clubs.forEach((club) => {
    const counts: Record<number, number> = {};
    clubs.forEach((_otherClub, index) => {
      counts[index + 1] = 0;
    });
    positionCounts.set(club.id, counts);
    titleCounts.set(club.id, 0);
    topCounts.set(club.id, 0);
    bottomCounts.set(club.id, 0);
  });

  for (let run = 0; run < runs; run += 1) {
    const matches = playedMatches.slice();
    remainingFixtures.forEach((fixture) => {
      const homeClub = clubById.get(fixture.homeClubId) as SimulationClub;
      const awayClub = clubById.get(fixture.awayClubId) as SimulationClub;
      const xg = calculateExpectedGoals(homeClub, awayClub);
      matches.push({
        matchday: fixture.matchday,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        homeGoals: samplePoisson(xg.home, rng),
        awayGoals: samplePoisson(xg.away, rng),
      });
    });
    const table: TableRow[] = computeTable(clubs, matches, rules);
    table.forEach((standing, index) => {
      const id = standing.clubId;
      (positionCounts.get(id) as Record<number, number>)[index + 1] += 1;
      if (index === 0) titleCounts.set(id, (titleCounts.get(id) || 0) + 1);
      if (index < Math.min(topN, clubs.length)) topCounts.set(id, (topCounts.get(id) || 0) + 1);
      if (index >= Math.max(0, clubs.length - bottomN)) {
        bottomCounts.set(id, (bottomCounts.get(id) || 0) + 1);
      }
    });
  }

  return clubs.map((club) => ({
    clubId: club.id,
    positionProbabilities: mapProbabilities(positionCounts.get(club.id) as Record<number, number>, runs),
    titleProbability: (titleCounts.get(club.id) || 0) / runs,
    topZoneProbability: (topCounts.get(club.id) || 0) / runs,
    bottomZoneProbability: (bottomCounts.get(club.id) || 0) / runs,
  }));
}

function mapProbabilities(counts: Record<number, number>, runs: number): Record<number, number> {
  const probabilities: Record<number, number> = {};
  Object.keys(counts).forEach((position) => {
    probabilities[Number(position)] = counts[Number(position)] / runs;
  });
  return probabilities;
}

export const forecastSeason = runForecast;
