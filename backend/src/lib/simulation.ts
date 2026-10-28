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
  events: SimulatedEvent[];
}

export type SimulationEventType =
  | 'kickoff' | 'possession_spell' | 'chance' | 'shot_off_target' | 'shot_blocked'
  | 'save' | 'goal' | 'corner' | 'foul' | 'yellow' | 'red' | 'substitution'
  | 'half_time' | 'second_half' | 'full_time';

export interface SimulatedEvent {
  seq: number;
  minute: number;
  minuteExtra: number;
  type: SimulationEventType;
  clubId: ClubId | null;
  playerId: ClubId | null;
  secondaryPlayerId: ClubId | null;
  payload: Record<string, number | string | boolean | null>;
  commentary: string;
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

/** Simulates a match as a deterministic sequence of possession, chances and outcomes. */
export function simulateMatch(
  homeClub: SimulationClub,
  awayClub: SimulationClub,
  rng: RandomSource,
  params: ExpectedGoalsParameters = {},
): SimulatedMatch {
  if (homeClub.id === awayClub.id) throw new Error('A club cannot play against itself');
  const expected = calculateExpectedGoals(homeClub, awayClub, params);
  const homeLineup = prepareLineup(homeClub, rng);
  const awayLineup = prepareLineup(awayClub, rng);
  const home = homeLineup.club;
  const away = awayLineup.club;
  const teams = [home, away];
  const substitutions = [...homeLineup.substitutions, ...awayLineup.substitutions];
  const players = teams.flatMap((team) => team.players ?? []);
  const playerStats = new Map(players.map((player) => [player.id, {
    clubId: home.players?.some((candidate) => candidate.id === player.id) ? home.id : away.id,
    playerId: player.id,
    isStarter: player.isStarter ?? true,
    minutesPlayed: player.minutesPlayed ?? 90,
    shots: 0, shotsOnTarget: 0, xg: 0, keyPasses: 0, tackles: 0,
  } satisfies PlayerMatchStats]));
  const teamStats = new Map(teams.map((team) => [team.id, {
    clubId: team.id, xg: 0, possession: 0, shots: 0, shotsOnTarget: 0,
    corners: 0, fouls: 0, saves: 0,
  } satisfies TeamMatchStats]));
  const scores = new Map<ClubId, number>([[home.id, 0], [away.id, 0]]);
  const possessionMinutes = new Map<ClubId, number>([[home.id, 0], [away.id, 0]]);
  const yellowCounts = new Map<ClubId, number>();
  const scorers: GoalScorer[] = [];
  const yellowCards: YellowCard[] = [];
  const redCards: RedCard[] = [];
  const fouls: Foul[] = [];
  const events: SimulatedEvent[] = [];
  const substitutionsDone = new Set<ClubId>();
  let lastLine = '';
  const lastTemplateByType = new Map<string, string>();
  let lastOpponentGoal: { clubId: ClubId; minute: number } | undefined;
  const templates: Record<string, string[]> = {
    kickoff: ['The referee gets the match under way.', 'And they are off.'],
    possession_spell: ['{club} are keeping the ball moving.', '{club} work the ball through midfield.', '{club} settle into possession.'],
    chance: ['{player}, the {role}, finds room to attack.', '{player} drives into a promising position.', '{player} helps turn the move into a chance.'],
    shot_off_target: ['{player} sends the effort wide.', '{player} cannot keep the shot on target.', '{player} tries from distance, but it drifts wide.'],
    shot_blocked: ['The defence blocks {player}’s shot.', '{player}’s effort is blocked.', 'A defender closes down {player}.'],
    save: ['The keeper keeps out {player}’s shot.', '{player} forces a save.', 'The goalkeeper is equal to {player}’s effort.'],
    goal: ['{player} finds the net.', '{player} finishes the chance.', '{player} scores for {club}.'],
    corner: ['Corner to {club}.', '{club} win a corner.', 'The ball goes behind for a {club} corner.'],
    foul: ['{player} is penalised for a foul.', 'Free kick after {player}’s challenge.', '{player} gives away a free kick.'],
    yellow: ['{player} is shown a yellow card.', 'The referee books {player}.', 'A caution for {player}.'],
    red: ['{player} is sent off.', 'The referee shows {player} a red card.', '{player} has to leave the pitch.'],
    substitution: ['{player} comes on for {other}.', '{other} makes way for {player}.', 'A change for {club}: {player} replaces {other}.'],
    half_time: ['The referee signals for half-time.'],
    second_half: ['The second half is under way.'],
    full_time: ['The final whistle goes.'],
  };
  const addEvent = (type: SimulationEventType, minute: number, extra = 0, clubId: ClubId | null = null,
    playerId: ClubId | null = null, otherId: ClubId | null = null,
    payload: SimulatedEvent['payload'] = {}) => {
    const club = teams.find((team) => team.id === clubId)?.name ?? '';
    const player = players.find((candidate) => candidate.id === playerId);
    const other = players.find((candidate) => candidate.id === otherId)?.name ?? '';
    const role = player?.position.toLowerCase() ?? 'player';
    const options = templates[type] ?? ['The match continues.'];
    let template = options[Math.floor(rng() * options.length)];
    if (options.length > 1 && template === lastTemplateByType.get(type)) {
      template = options.find((option) => option !== template)!;
    }
    let line = template
      .replaceAll('{club}', club).replaceAll('{player}', player?.name ?? '').replaceAll('{other}', other).replaceAll('{role}', role);
    if (type === 'goal' && clubId !== null) {
      const difference = (scores.get(clubId) ?? 0) - (scores.get(clubId === home.id ? away.id : home.id) ?? 0);
      if (difference > 0 && minute >= 85) line = `${player?.name ?? 'A scorer'} may have found a late winner.`;
      else if (difference > 0) line = `${player?.name ?? 'A scorer'} puts ${club} in front.`;
      else if (difference === 0 && lastOpponentGoal && minute - lastOpponentGoal.minute <= 5) line = `${player?.name ?? 'A scorer'} equalises within five minutes.`;
      else if (difference === 0) line = `${player?.name ?? 'A scorer'} brings the sides level.`;
    }
    if (line === lastLine && options.length > 1) {
      const alternative = options.find((option) => option !== template && option !== lastTemplateByType.get(type)) ?? options.find((option) => option !== template)!;
      template = alternative;
      line = alternative.replaceAll('{club}', club).replaceAll('{player}', player?.name ?? '').replaceAll('{other}', other).replaceAll('{role}', role);
    }
    lastLine = line;
    lastTemplateByType.set(type, template);
    events.push({ seq: events.length + 1, minute, minuteExtra: extra, type, clubId, playerId,
      secondaryPlayerId: otherId, payload, commentary: `${minute}${extra ? `+${extra}` : ''}' ${line}` });
  };
  const activeOutfield = (team: SimulationClub, minute: number) => (team.players ?? [])
    .filter((player) => positionWeight(player.position) > 0 && participatingAt(player, minute));
  const selectPlayer = (team: SimulationClub, minute: number, attack = true) => {
    const active = activeOutfield(team, minute);
    if (!active.length) return undefined;
    const weight = (player: SimulationPlayer) => {
      const position = player.position.toUpperCase();
      return attack ? (position === 'FWD' ? 4 : position === 'MID' ? 2 : 0.7)
        : (position === 'DEF' ? 3 : position === 'MID' ? 2 : 0.7);
    };
    let ticket = rng() * active.reduce((total, player) => total + weight(player), 0);
    for (const player of active) {
      ticket -= weight(player);
      if (ticket < 0) return player;
    }
    return active[active.length - 1];
  };
  const homeControl = (homeClub.attack + homeClub.defence) / 2;
  const awayControl = (awayClub.attack + awayClub.defence) / 2;
  const homeBall = clamp(0.525 + (homeControl - awayControl) * 0.002, 0.38, 0.62);
  const firstExtra = 1 + Math.floor(rng() * 3);
  const secondExtra = 1 + Math.floor(rng() * 5);

  const playMinute = (minute: number, extra = 0) => {
    for (const change of substitutions) {
      if (change.minute !== minute || substitutionsDone.has(change.playerOnId)) continue;
      substitutionsDone.add(change.playerOnId);
      addEvent('substitution', minute, extra, change.clubId, change.playerOnId, change.playerOffId);
    }
    const attacking = rng() < homeBall ? home : away;
    const defending = attacking.id === home.id ? away : home;
    possessionMinutes.set(attacking.id, (possessionMinutes.get(attacking.id) ?? 0) + 1);
    if (minute % 5 === 0 && extra === 0) addEvent('possession_spell', minute, 0, attacking.id);
    const isChasing = (scores.get(attacking.id) ?? 0) < (scores.get(defending.id) ?? 0) && minute >= 65;
    const isProtecting = (scores.get(attacking.id) ?? 0) > (scores.get(defending.id) ?? 0) && minute >= 65;
    const fatigue = 1 - Math.max(0, minute - 60) / 30 * 0.08;
    const attackManpower = 1 - redCards.filter((card) => card.clubId === attacking.id).length * 0.12;
    const defenceManpower = 1 - redCards.filter((card) => card.clubId === defending.id).length * 0.12;
    const chanceRate = clamp(0.24 * attacking.attack / Math.max(1, defending.defence)
      * (isChasing ? 1.12 : isProtecting ? 0.94 : 1) * fatigue * attackManpower / Math.max(0.55, defenceManpower), 0.1, 0.38);
    if (rng() < chanceRate) {
      const shooter = selectPlayer(attacking, minute);
      if (shooter) {
        const playerStat = playerStats.get(shooter.id)!;
        const chanceMakers = activeOutfield(attacking, minute).filter((player) => player.id !== shooter.id && ['MID', 'FWD'].includes(player.position.toUpperCase()));
        const assister = chanceMakers.length && rng() < 0.67 ? chanceMakers[Math.floor(rng() * chanceMakers.length)] : undefined;
        if (assister) playerStats.get(assister.id)!.keyPasses += 1;
        const expectedForTeam = attacking.id === home.id ? expected.home : expected.away;
        const shotXg = Number(clamp(expectedForTeam / 11 * (isChasing ? 1.12 : 1) * fatigue, 0.025, 0.34).toFixed(3));
        playerStat.shots += 1;
        playerStat.xg += shotXg;
        teamStats.get(attacking.id)!.shots += 1;
        teamStats.get(attacking.id)!.xg += shotXg;
        addEvent('chance', minute, extra, attacking.id, shooter.id, assister?.id ?? null, { xg: shotXg });
        const result = rng();
        if (result < shotXg) {
          playerStat.shotsOnTarget += 1;
          teamStats.get(attacking.id)!.shotsOnTarget += 1;
          const previousOpposingGoal = scorers.slice().reverse().find((goal) => goal.clubId !== attacking.id);
          if (previousOpposingGoal) lastOpponentGoal = { clubId: previousOpposingGoal.clubId, minute: previousOpposingGoal.minute };
          scores.set(attacking.id, (scores.get(attacking.id) ?? 0) + 1);
          scorers.push({ clubId: attacking.id, playerId: shooter.id, playerName: shooter.name,
            minute, assistPlayerId: assister?.id ?? null, assistPlayerName: assister?.name ?? null });
          addEvent('goal', minute, extra, attacking.id, shooter.id, assister?.id ?? null,
            { home_goals: scores.get(home.id)!, away_goals: scores.get(away.id)! });
        } else if (result < shotXg + 0.22) {
          playerStat.shotsOnTarget += 1;
          teamStats.get(attacking.id)!.shotsOnTarget += 1;
          teamStats.get(defending.id)!.saves += 1;
          const keeper = (defending.players ?? []).find((player) => player.position.toUpperCase() === 'GK' && participatingAt(player, minute));
          addEvent('save', minute, extra, defending.id, keeper?.id ?? null, shooter.id, { attacking_club_id: Number(attacking.id) });
        } else if (result < shotXg + 0.45) {
          addEvent('shot_blocked', minute, extra, attacking.id, shooter.id);
          if (rng() < 0.2) {
            teamStats.get(attacking.id)!.corners += 1;
            addEvent('corner', minute, extra, attacking.id);
          }
        } else addEvent('shot_off_target', minute, extra, attacking.id, shooter.id);
      }
    }
    if (rng() < 0.22) {
      const offender = selectPlayer(defending, minute, false);
      if (offender) {
        fouls.push({ clubId: defending.id, playerId: offender.id, playerName: offender.name, minute });
        teamStats.get(defending.id)!.fouls += 1;
        addEvent('foul', minute, extra, defending.id, offender.id);
        if (rng() < 0.1) {
          yellowCards.push({ clubId: defending.id, playerId: offender.id, playerName: offender.name, minute });
          yellowCounts.set(offender.id, (yellowCounts.get(offender.id) ?? 0) + 1);
          addEvent('yellow', minute, extra, defending.id, offender.id);
          if (yellowCounts.get(offender.id) === 2) {
            const dismissed = defending.players?.find((player) => player.id === offender.id);
            if (dismissed) dismissed.leftAt = minute;
            playerStats.get(offender.id)!.minutesPlayed = Math.max(0, minute - (dismissed?.startedAt ?? 0));
            redCards.push({ clubId: defending.id, playerId: offender.id, playerName: offender.name, minute });
            addEvent('red', minute, extra, defending.id, offender.id, null, { second_yellow: true });
          }
        } else if (rng() < 0.005) {
          const dismissed = defending.players?.find((player) => player.id === offender.id);
          if (dismissed) dismissed.leftAt = minute;
          playerStats.get(offender.id)!.minutesPlayed = Math.max(0, minute - (dismissed?.startedAt ?? 0));
          redCards.push({ clubId: defending.id, playerId: offender.id, playerName: offender.name, minute });
          addEvent('red', minute, extra, defending.id, offender.id);
        }
      }
    }
    const tackler = selectPlayer(defending, minute, false);
    if (tackler && rng() < 0.28) playerStats.get(tackler.id)!.tackles += 1;
  };

  addEvent('kickoff', 0, 0, home.id);
  for (let minute = 1; minute <= 45; minute += 1) playMinute(minute);
  for (let extra = 1; extra <= firstExtra; extra += 1) playMinute(45, extra);
  addEvent('half_time', 45, firstExtra, null, null, null, { home_goals: scores.get(home.id)!, away_goals: scores.get(away.id)! });
  addEvent('second_half', 46, 0, home.id);
  for (let minute = 46; minute <= 90; minute += 1) playMinute(minute);
  for (let extra = 1; extra <= secondExtra; extra += 1) playMinute(90, extra);
  addEvent('full_time', 90, secondExtra, null, null, null, { home_goals: scores.get(home.id)!, away_goals: scores.get(away.id)! });

  const totalPossession = (possessionMinutes.get(home.id) ?? 0) + (possessionMinutes.get(away.id) ?? 0);
  const homePossession = totalPossession ? Math.round((possessionMinutes.get(home.id) ?? 0) / totalPossession * 100) : 50;
  teamStats.get(home.id)!.possession = homePossession;
  teamStats.get(away.id)!.possession = 100 - homePossession;
  return {
    homeClubId: home.id,
    awayClubId: away.id,
    homeGoals: scores.get(home.id)!,
    awayGoals: scores.get(away.id)!,
    scorers,
    yellowCards,
    redCards,
    fouls,
    substitutions,
    teamStats: [teamStats.get(home.id)!, teamStats.get(away.id)!],
    playerStats: [...playerStats.values()],
    expectedGoals: { home: teamStats.get(home.id)!.xg, away: teamStats.get(away.id)!.xg },
    events,
  };
}
