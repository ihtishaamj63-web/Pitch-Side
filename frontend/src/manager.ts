import type { Club, ManagerMatchSummary, ManagerState } from './types';

type Result = 'W' | 'D' | 'L';
type Margin = 'one' | 'two' | 'threePlus';
type Timing = 0 | 1 | 2;

const headlines: Record<Result, Record<Margin, [string, string, string]>> = {
  W: {
    one: [
      '{team} edge {opponent} after an early breakthrough',
      '{team} grind out a narrow win over {opponent}',
      '{team} snatch it from {opponent} at the death',
    ],
    two: [
      '{team} make a fast start and see off {opponent}',
      '{team} pull clear of {opponent} after the break',
      '{team} stun {opponent} with a late double',
    ],
    threePlus: [
      '{team} run riot early and leave {opponent} chasing shadows',
      '{team} turn on the style to thrash {opponent}',
      '{team} finish {opponent} off with a ruthless late flurry',
    ],
  },
  D: {
    one: [
      '{team} and {opponent} trade blows before sharing the points',
      '{team} and {opponent} cancel each other out',
      '{team} and {opponent} leave it late, but neither can land the winner',
    ],
    two: [
      '{team} and {opponent} serve up an open game and an even score',
      '{team} and {opponent} share the spoils after a lively second half',
      '{team} and {opponent} leave the drama late, and the points level',
    ],
    threePlus: [
      '{team} and {opponent} trade goals in a breathless stalemate',
      '{team} and {opponent} turn this into a goal-fest with no winner',
      '{team} and {opponent} keep scoring until time runs out',
    ],
  },
  L: {
    one: [
      '{team} fall just short after an early setback against {opponent}',
      '{team} lose a tight one to {opponent}',
      '{team} are undone by a late {opponent} goal',
    ],
    two: [
      '{team} have an early hole to climb out of against {opponent}',
      '{team} fade after the break as {opponent} pull clear',
      '{team} let {opponent} settle it late',
    ],
    threePlus: [
      '{team} never recover from an early {opponent} onslaught',
      '{team} are comfortably beaten by {opponent}',
      '{team} ship a late flurry as {opponent} run away with it',
    ],
  },
};

function resultOf(match: ManagerMatchSummary): Result {
  if (match.goalsFor > match.goalsAgainst) return 'W';
  if (match.goalsFor < match.goalsAgainst) return 'L';
  return 'D';
}

function marginOf(match: ManagerMatchSummary): Margin {
  const difference = resultOf(match) === 'D'
    ? match.goalsFor + match.goalsAgainst
    : Math.abs(match.goalsFor - match.goalsAgainst);
  if (difference <= 1) return 'one';
  if (difference === 2) return 'two';
  return 'threePlus';
}

function timingOf(minute: number | undefined): Timing {
  if (minute === undefined || minute < 30) return 0;
  if (minute <= 75) return 1;
  return 2;
}

export function managerMatchRating(match: ManagerMatchSummary): number {
  const result = resultOf(match);
  const base = result === 'W' ? 7.5 : result === 'D' ? 6.5 : 5.5;
  const xgAdjustment = Math.max(-0.5, Math.min(0.5, (match.expectedGoalsFor - match.expectedGoalsAgainst) * 0.15));
  return Math.round((base + xgAdjustment) * 10) / 10;
}

export function appendManagerMatch(state: ManagerState, match: ManagerMatchSummary): ManagerState {
  const rating = managerMatchRating(match);
  const currentStreak = rating >= 7 ? state.currentStreak + 1 : 0;
  const matchesManaged = state.matchesManaged + 1;
  return {
    currentStreak,
    bestStreak: Math.max(state.bestStreak, currentStreak),
    averageRating: Math.round(((state.averageRating * state.matchesManaged + rating) / matchesManaged) * 10) / 10,
    matchesManaged,
  };
}

export function generateHeadline(match: ManagerMatchSummary, clubs: Club[]): string {
  const team = clubs.find(club => String(club.id) === String(match.clubId))?.name ?? 'Your side';
  const opponent = clubs.find(club => String(club.id) === String(match.opponentId))?.name ?? 'their opponents';
  if (match.goalsFor === 0 && match.goalsAgainst === 0) {
    return `${team} park the bus and hold on for a point`;
  }
  const template = headlines[resultOf(match)][marginOf(match)][timingOf(match.lastGoalMinute)];
  return template.replace('{team}', team).replace('{opponent}', opponent);
}
