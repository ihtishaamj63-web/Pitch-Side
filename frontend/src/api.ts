import type {
  ClubDetail,
  CreateLeaguePayload,
  LeagueDetail,
  LeagueSummary,
  Match,
  MatchDetail,
  PlayerStat,
  Standing,
} from './types';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(`Could not reach the league server at ${API_URL}. Check the API is running.`);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `The request failed (${response.status}).`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (data?: unknown): RequestInit => ({
  method: 'POST',
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});

export const api = {
  leagues: () => request<LeagueSummary[]>('/api/leagues'),
  createLeague: (data: CreateLeaguePayload) => request<{ id: number | string }>('/api/leagues', json(data)),
  league: (id: number | string) => request<LeagueDetail>(`/api/leagues/${id}`),
  table: (id: number | string) => request<Standing[]>(`/api/leagues/${id}/table`),
  matches: (id: number | string, matchday?: number) =>
    request<Match[]>(`/api/leagues/${id}/matches${matchday ? `?matchday=${matchday}` : ''}`),
  match: (id: number | string) => request<MatchDetail>(`/api/matches/${id}`),
  playerStats: (id: number | string) => request<PlayerStat[]>(`/api/leagues/${id}/scorers`),
  simulate: (id: number | string, action: 'next' | 'all') =>
    request<unknown>(`/api/leagues/${id}/simulate/${action}`, json()),
  resetLeague: (id: number | string) =>
    request<{ status: string }>(`/api/leagues/${id}/reset`, json()),
  club: (id: number | string) => request<ClubDetail>(`/api/clubs/${id}`),
};

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
