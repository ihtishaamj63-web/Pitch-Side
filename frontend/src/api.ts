import type {
  ClubDetail,
  CreateLeaguePayload,
  LeagueDetail,
  LeagueSummary,
  ManagerMatchSummary,
  Match,
  MatchDetail,
  PlayerStat,
  Standing,
  Tactics,
} from './types';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const CACHE_TTL_MS = 1_500;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const cacheable = method === 'GET';
  const cached = cacheable ? responseCache.get(path) : undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(path);
  if (cacheable && inFlight.has(path)) return inFlight.get(path) as Promise<T>;

  const operation = (async (): Promise<T> => {
    let response: Response | undefined;
    for (let attempt = 0; attempt < (cacheable ? 2 : 1); attempt += 1) {
      try {
        response = await fetch(`${API_URL}${path}`, {
          ...init,
          headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers,
          },
        });
        break;
      } catch {
        if (attempt === (cacheable ? 1 : 0)) {
          throw new Error(`Could not reach the league server at ${API_URL}. Check the API is running.`);
        }
      }
    }

    if (!response) throw new Error('The league server returned no response.');
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `The request failed (${response.status}).`;
      throw new Error(message);
    }
    const value = response.status === 204 ? undefined as T : await response.json() as T;
    if (cacheable) responseCache.set(path, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    else responseCache.clear();
    return value;
  })();

  if (cacheable) inFlight.set(path, operation);
  try {
    return await operation;
  } finally {
    if (cacheable) inFlight.delete(path);
  }
}

const json = (data?: unknown): RequestInit => ({
  method: 'POST',
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});

export interface ManagerSimulationResponse {
  matchday: number;
  matchesPlayed: number;
  managerMatch: ManagerMatchSummary | null;
}

export interface LiveMatchUpdate {
  now: string;
  status: 'scheduled' | 'live' | 'finished';
  minute: number;
  minute_extra: number;
  period: string;
  home_goals: number | null;
  away_goals: number | null;
  events: MatchDetail['events'];
}

export type LiveSpeed = 'instant' | 'quick' | 'standard' | 'extended';

export const api = {
  leagues: () => request<LeagueSummary[]>('/api/leagues'),
  createLeague: (data: CreateLeaguePayload) => request<{ id: number | string }>('/api/leagues', json(data)),
  deleteLeague: (id: number | string) => request<void>(`/api/leagues/${id}`, { method: 'DELETE' }),
  league: (id: number | string) => request<LeagueDetail>(`/api/leagues/${id}`),
  table: (id: number | string, upToMatchday?: number) =>
    request<Standing[]>(`/api/leagues/${id}/table${upToMatchday ? `?upToMatchday=${upToMatchday}` : ''}`),
  tableHistory: (id: number | string) =>
    request<Array<{ matchday: number; positions: Array<{ club_id: number | string; club_name: string; position: number }> }>>(`/api/leagues/${id}/table/history`),
  matches: (id: number | string, matchday?: number) =>
    request<Match[]>(`/api/leagues/${id}/matches${matchday ? `?matchday=${matchday}` : ''}`),
  match: (id: number | string) => request<MatchDetail>(`/api/matches/${id}`),
  matchLive: (id: number | string, after = 0) => request<LiveMatchUpdate>(`/api/matches/${id}/live?after=${after}`),
  live: (id: number | string) => request<{ status: 'idle' | 'live'; matchday: number | null; matches: Match[] }>(`/api/leagues/${id}/live`),
  liveStreamUrl: (id: number | string) => `${API_URL}/api/leagues/${id}/live/stream`,
  playerStats: (id: number | string, upToMatchday?: number) =>
    request<PlayerStat[]>(`/api/leagues/${id}/player-stats${upToMatchday ? `?upToMatchday=${upToMatchday}` : ''}`),
  simulate: (id: number | string, action: 'next' | 'all') =>
    request<{ matchday?: number; matchdaysPlayed?: number; matchesPlayed?: number }>(`/api/leagues/${id}/simulate/${action}`, json()),
  simulateWithManager: (id: number | string, clubId: number, tactics: Tactics) =>
    request<ManagerSimulationResponse>(
      `/api/leagues/${id}/simulate/next`,
      json({ managerClubId: clubId, tactics }),
    ),
  kickoffMatchday: (id: number | string, matchday: number, speed: LiveSpeed, manager?: { clubId: number; tactics: Tactics }) =>
    request<{ matchday: number; matchesStarted?: number; matchesFinished?: number; status: 'live' | 'finished' }>(
      `/api/leagues/${id}/matchdays/${matchday}/kickoff`,
      json({ speed, ...(manager ? { managerClubId: manager.clubId, tactics: manager.tactics } : {}) }),
    ),
  skipLiveMatchday: (id: number | string) =>
    request<{ status: string; matchesFinished: number }>(`/api/leagues/${id}/live/skip`, json()),
  resetLeague: (id: number | string) =>
    request<{ status: string }>(`/api/leagues/${id}/reset`, json()),
  club: (id: number | string) => request<ClubDetail>(`/api/clubs/${id}`),
};

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
