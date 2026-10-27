import { ClubId } from './league';
import { RandomSource } from './random';
import { Club, PlayedMatch } from './standings';

export interface SimulationPlayer {
  id: ClubId;
  name: string;
  position: string;
  clubId?: ClubId;
  isStarter?: boolean;
  minutesPlayed?: number;
  startedAt?: number;
  leftAt?: number;
}

export interface SimulationClub extends Club {
  players?: SimulationPlayer[];
}

export interface ExpectedGoals {
  home: number;
  away: number;
}

export interface GoalScorer {
  clubId: ClubId;
  playerId: ClubId;
  playerName: string;
  minute: number;
  assistPlayerId: ClubId | null;
  assistPlayerName: string | null;
}

export interface YellowCard {
  clubId: ClubId;
  playerId: ClubId;
  playerName: string;
  minute: number;
}

export interface RedCard extends YellowCard {}

export interface Foul {
  clubId: ClubId;
  playerId: ClubId;
  playerName: string;
  minute: number;
}

export interface TeamMatchStats {
  clubId: ClubId;
  xg: number;
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  saves: number;
}

export interface PlayerMatchStats {
  clubId: ClubId;
  playerId: ClubId;
  isStarter: boolean;
  minutesPlayed: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  keyPasses: number;
  tackles: number;
}

export interface Substitution {
  clubId: ClubId;
  playerOffId: ClubId;
  playerOffName: string;
  playerOnId: ClubId;
  playerOnName: string;
  minute: number;
}

export interface SimulatedMatch extends PlayedMatch {
  scorers: GoalScorer[];
  yellowCards: YellowCard[];
  redCards: RedCard[];
  fouls: Foul[];
  substitutions: Substitution[];
  teamStats: TeamMatchStats[];
  playerStats: PlayerMatchStats[];
  expectedGoals: ExpectedGoals;
}

export type Tactics = 'attacking' | 'balanced' | 'defensive';

export interface ManagerChoices {
  clubId: number;
  tactics: Tactics;
}

export interface ManagerMatchSummary {
  matchId: number;
  matchday: number;
  clubId: number;
  opponentId: number;
  isHome: boolean;
  tactics: Tactics;
  expectedGoalsFor: number;
  expectedGoalsAgainst: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface ExpectedGoalsParameters {
  baseGoals?: number;
  homeAdv?: number;
}

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

export function applyTactics<T extends SimulationClub>(club: T, tactics: Tactics): T {
  const modifiers = {
    attacking: { attack: 1.1, defence: 0.9 },
    balanced: { attack: 1, defence: 1 },
    defensive: { attack: 0.9, defence: 1.1 },
  }[tactics];

  return {
    ...club,
    attack: Math.round(clamp(club.attack * modifiers.attack, 1, 100)),
    defence: Math.round(clamp(club.defence * modifiers.defence, 1, 100)),
  };
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

function participatingAt(player: SimulationPlayer, minute: number): boolean {
  if (player.isStarter === undefined) return true;
  if (player.isStarter) return player.leftAt === undefined || minute < player.leftAt;
  return player.startedAt !== undefined && minute >= player.startedAt
    && (player.leftAt === undefined || minute < player.leftAt);
}

function prepareLineup(club: SimulationClub, rng: RandomSource): { club: SimulationClub; substitutions: Substitution[] } {
  const squad = club.players ?? [];
  const remaining = [...squad];
  const starters: SimulationPlayer[] = [];
  const take = (position: string, count: number) => {
    for (let index = 0; index < count; index += 1) {
      const playerIndex = remaining.findIndex(player => player.position.toUpperCase() === position);
      if (playerIndex === -1) return;
      starters.push(remaining.splice(playerIndex, 1)[0]);
    }
  };
  take('GK', 1);
  take('DEF', 4);
  take('MID', 4);
  take('FWD', 2);
  while (starters.length < 11 && remaining.length > 0) starters.push(remaining.shift()!);

  const bench = remaining;
  const activeStarters = [...starters];
  const substitutions: Substitution[] = [];
  const players = new Map<number, SimulationPlayer>();
  const times = bench.map((_, index) => 58 + index * 10 + Math.floor(rng() * 6));
  starters.forEach(player => players.set(Number(player.id), { ...player, isStarter: true, minutesPlayed: 90 }));

  bench.forEach((substitute, index) => {
    const starterIndex = activeStarters.findIndex(player => player.position === substitute.position);
    if (starterIndex === -1) return;
    const [playerOff] = activeStarters.splice(starterIndex, 1);
    const minute = times[index];
    const playerOffStats = players.get(Number(playerOff.id));
    if (!playerOffStats) return;
    players.set(Number(playerOff.id), { ...playerOffStats, leftAt: minute, minutesPlayed: minute });
    players.set(Number(substitute.id), { ...substitute, isStarter: false, startedAt: minute, minutesPlayed: 90 - minute });
    substitutions.push({
      clubId: club.id,
      playerOffId: playerOff.id,
      playerOffName: playerOff.name,
      playerOnId: substitute.id,
      playerOnName: substitute.name,
      minute,
    });
  });

  bench.filter(player => !players.has(Number(player.id))).forEach(player => {
    players.set(Number(player.id), { ...player, isStarter: false, minutesPlayed: 0 });
  });
  const lineup = squad.map(player => players.get(Number(player.id)) ?? { ...player, isStarter: true, minutesPlayed: 90 });
  return { club: { ...club, players: lineup }, substitutions };
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
    const minute = Math.floor(rng() * 90) + 1;
    const active = eligible.filter(({ player }) => participatingAt(player, minute));
    if (active.length === 0) continue;
    const totalWeight = active.reduce((total, entry) => total + entry.weight, 0);
    let selection = rng() * totalWeight;
    let selected = active[active.length - 1].player;
    for (let candidate = 0; candidate < active.length; candidate += 1) {
      selection -= active[candidate].weight;
      if (selection < 0) {
        selected = active[candidate].player;
        break;
      }
    }
    scorers.push({
      clubId: clubId === undefined ? selected.clubId ?? selected.id : clubId,
      playerId: selected.id,
      playerName: selected.name,
      minute,
      assistPlayerId: null,
      assistPlayerName: null,
    });
  }
  return scorers.sort((left, right) => left.minute - right.minute);
}

function assignAssist(
  scorer: GoalScorer,
  squad: SimulationPlayer[],
  rng: RandomSource,
): GoalScorer {
  const eligible = squad
    .filter((player) => player.id !== scorer.playerId && positionWeight(player.position) > 0 && participatingAt(player, scorer.minute));
  if (eligible.length === 0) return scorer;
  const player = eligible[Math.floor(rng() * eligible.length)];
  return { ...scorer, assistPlayerId: player.id, assistPlayerName: player.name };
}

function assignPlayerEvents<T extends YellowCard>(
  count: number,
  homeClub: SimulationClub,
  awayClub: SimulationClub,
  rng: RandomSource,
  excludedPlayerIds: Set<ClubId> = new Set(),
): T[] {
  const squads = [homeClub, awayClub].flatMap((club) =>
    (club.players ?? []).map((player) => ({ clubId: club.id, player })),
  );
  if (squads.length === 0) return [];
  return Array.from({ length: count }, () => {
    const minute = Math.floor(rng() * 90) + 1;
    const active = squads.filter(({ player }) => !excludedPlayerIds.has(player.id) && participatingAt(player, minute));
    if (active.length === 0) return null;
    const { clubId, player } = active[Math.floor(rng() * active.length)];
    return {
      clubId,
      playerId: player.id,
      playerName: player.name,
      minute,
    };
  }).filter((event): event is NonNullable<typeof event> => event !== null)
    .sort((left, right) => left.minute - right.minute) as T[];
}

function createTeamAndPlayerStats(
  club: SimulationClub,
  opponent: SimulationClub,
  scorers: GoalScorer[],
  expectedGoalsValue: number,
  possession: number,
  fouls: Foul[],
  redCards: RedCard[],
  rng: RandomSource,
): { team: TeamMatchStats; players: PlayerMatchStats[] } {
  const squad = club.players ?? [];
  const eligible = squad.filter((player) => positionWeight(player.position) > 0 && (player.minutesPlayed ?? 90) > 0);
  if (eligible.length === 0 && scorers.length > 0) {
    throw new Error('Cannot record shots without an eligible outfield player');
  }
  const playerStats = new Map(squad.map((player) => [player.id, {
    clubId: club.id,
    playerId: player.id,
    isStarter: player.isStarter ?? true,
    minutesPlayed: player.minutesPlayed ?? 90,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    keyPasses: 0,
    tackles: 0,
  } satisfies PlayerMatchStats]));

  for (const scorer of scorers) {
    const stats = playerStats.get(scorer.playerId);
    if (stats) {
      stats.shots += 1;
      stats.shotsOnTarget += 1;
    }
    if (scorer.assistPlayerId !== null) {
      const assistStats = playerStats.get(scorer.assistPlayerId);
      if (assistStats) assistStats.keyPasses += 1;
    }
  }
  const shots = Math.max(scorers.length, samplePoisson(11.5, rng));
  const shotsOnTarget = Math.min(shots, Math.max(scorers.length, samplePoisson(4.2, rng)));
  for (let shot = scorers.length; shot < shots && eligible.length > 0; shot += 1) {
    const minute = Math.floor(rng() * 90) + 1;
    const available = eligible.filter(player => participatingAt(player, minute));
    if (!available.length) continue;
    const player = available[Math.floor(rng() * available.length)];
    playerStats.get(player.id)!.shots += 1;
  }
  for (let shot = scorers.length; shot < shotsOnTarget && eligible.length > 0; shot += 1) {
    const available = eligible.filter((player) => {
      const stats = playerStats.get(player.id)!;
      return stats.shotsOnTarget < stats.shots;
    });
    if (!available.length) break;
    const player = available[Math.floor(rng() * available.length)];
    playerStats.get(player.id)!.shotsOnTarget += 1;
  }

  const weightedShots = [...playerStats.values()].map((stats) => ({
    stats,
    rawXg: Array.from({ length: stats.shots }, () => 0.02 + rng() * 0.16)
      .reduce((sum, value) => sum + value, 0),
  }));
  const rawXgTotal = weightedShots.reduce((sum, shot) => sum + shot.rawXg, 0);
  weightedShots.forEach(({ stats, rawXg }) => {
    stats.xg = rawXgTotal > 0 ? expectedGoalsValue * rawXg / rawXgTotal : 0;
  });

  const keyPassCount = samplePoisson(4, rng);
  for (let index = 0; index < keyPassCount; index += 1) {
    const minute = Math.floor(rng() * 90) + 1;
    const player = eligible.filter((candidate) => ['MID', 'FWD'].includes(candidate.position.toUpperCase()) && participatingAt(candidate, minute));
    if (player.length) playerStats.get(player[Math.floor(rng() * player.length)].id)!.keyPasses += 1;
  }
  const tackleCount = samplePoisson(25, rng);
  for (let index = 0; index < tackleCount; index += 1) {
    const minute = Math.floor(rng() * 90) + 1;
    const available = eligible.filter(player => participatingAt(player, minute));
    if (available.length) playerStats.get(available[Math.floor(rng() * available.length)].id)!.tackles += 1;
  }
  redCards.filter((card) => card.clubId === club.id).forEach((card) => {
    const stats = playerStats.get(card.playerId);
    if (stats) stats.minutesPlayed = Math.min(stats.minutesPlayed, Math.max(0, card.minute - (squad.find(player => player.id === card.playerId)?.startedAt ?? 0)));
  });
  const teamFouls = fouls.filter((foul) => foul.clubId === club.id).length;
  const team: TeamMatchStats = {
    clubId: club.id,
    xg: expectedGoalsValue,
    possession,
    shots,
    shotsOnTarget,
    corners: samplePoisson(5.2, rng),
    fouls: teamFouls,
    saves: 0,
  };
  return { team, players: [...playerStats.values()] };
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
  const homeLineup = prepareLineup(homeClub, rng);
  const awayLineup = prepareLineup(awayClub, rng);
  const homeScheduledOffIds = new Set(homeLineup.substitutions.map(substitution => substitution.playerOffId));
  const awayScheduledOffIds = new Set(awayLineup.substitutions.map(substitution => substitution.playerOffId));
  const redCards = assignPlayerEvents<RedCard>(
    Math.min(1, samplePoisson(0.12, rng)),
    homeLineup.club,
    awayLineup.club,
    rng,
    new Set([...homeScheduledOffIds, ...awayScheduledOffIds]),
  );
  for (const card of redCards) {
    const player = [...(homeLineup.club.players ?? []), ...(awayLineup.club.players ?? [])]
      .find(candidate => candidate.id === card.playerId);
    if (player) {
      player.leftAt = card.minute;
      player.minutesPlayed = Math.max(0, card.minute - (player.startedAt ?? 0));
    }
  }
  const homeScorers = assignScorers(homeGoals, homeLineup.club.players || [], rng, homeClub.id)
    .map((scorer) => assignAssist(scorer, homeLineup.club.players || [], rng))
    .sort((left, right) => left.minute - right.minute);
  const awayScorers = assignScorers(awayGoals, awayLineup.club.players || [], rng, awayClub.id)
    .map((scorer) => assignAssist(
      scorer,
      awayLineup.club.players || [],
      rng,
    ))
    .sort((left, right) => left.minute - right.minute);
  const scorers = homeScorers.concat(awayScorers)
    .sort((left, right) => left.minute - right.minute);
  const yellowCards = assignPlayerEvents<YellowCard>(Math.min(6, samplePoisson(2.2, rng)), homeLineup.club, awayLineup.club, rng);
  const fouls = assignPlayerEvents<Foul>(samplePoisson(22, rng), homeLineup.club, awayLineup.club, rng);
  const homePossession = clamp(
    Math.round(50 + (homeClub.attack - awayClub.attack) * 0.15 + (rng() - 0.5) * 12),
    30,
    70,
  );
  const homeStats = createTeamAndPlayerStats(
    homeLineup.club, awayLineup.club, homeScorers, xg.home, homePossession, fouls, redCards, rng,
  );
  const awayStats = createTeamAndPlayerStats(
    awayLineup.club, homeLineup.club, awayScorers, xg.away, 100 - homePossession, fouls, redCards, rng,
  );
  homeStats.team.saves = Math.max(0, awayStats.team.shotsOnTarget - awayGoals);
  awayStats.team.saves = Math.max(0, homeStats.team.shotsOnTarget - homeGoals);

  return {
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    homeGoals,
    awayGoals,
    scorers,
    yellowCards,
    redCards,
    fouls,
    substitutions: [...homeLineup.substitutions, ...awayLineup.substitutions],
    teamStats: [homeStats.team, awayStats.team],
    playerStats: [...homeStats.players, ...awayStats.players],
    expectedGoals: xg,
  };
}
