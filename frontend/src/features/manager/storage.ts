import type { Tactics } from '../../types';

export interface ManagerSelection {
  clubId: number | null;
  tactics: Tactics;
  error: string;
}

const clubKey = (leagueId: number | string) => `pitch:manager-club:${leagueId}`;
const tacticsKey = (leagueId: number | string) => `pitch:manager-tactics:${leagueId}`;
const isTactics = (value: string): value is Tactics =>
  value === 'attacking' || value === 'balanced' || value === 'defensive';

export function readManagerClubId(leagueId: number | string): number | null {
  const stored = window.localStorage.getItem(clubKey(leagueId));
  if (stored === null) return null;
  if (!/^[1-9]\d*$/.test(stored) || !Number.isSafeInteger(Number(stored))) {
    throw new Error('The saved manager team is invalid. Clear it and choose a team again.');
  }
  return Number(stored);
}

export function readManagerSelection(leagueId: number | string): ManagerSelection {
  try {
    const clubId = readManagerClubId(leagueId);
    const storedTactics = clubId === null ? null : window.localStorage.getItem(tacticsKey(leagueId));
    if (storedTactics !== null && !isTactics(storedTactics)) {
      throw new Error('The saved tactics are invalid. Choose your tactics again.');
    }
    return { clubId, tactics: storedTactics ?? 'balanced', error: '' };
  } catch (error) {
    return {
      clubId: null,
      tactics: 'balanced',
      error: error instanceof Error ? error.message : 'Could not read the saved manager settings.',
    };
  }
}

export function saveManagerClubId(leagueId: number | string, clubId: number) {
  saveManagerTactics(leagueId, 'balanced');
  window.localStorage.setItem(clubKey(leagueId), String(clubId));
  window.dispatchEvent(new Event('pitch:manager-team-changed'));
}

export function saveManagerTactics(leagueId: number | string, tactics: Tactics) {
  window.localStorage.setItem(tacticsKey(leagueId), tactics);
}

export function clearManagerClubId(leagueId: number | string) {
  window.localStorage.removeItem(clubKey(leagueId));
  window.localStorage.removeItem(tacticsKey(leagueId));
  window.dispatchEvent(new Event('pitch:manager-team-changed'));
}

export { isTactics };
