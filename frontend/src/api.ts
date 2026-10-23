import type {
  ClubDetail,
  CreateLeaguePayload,
  ForecastResponse,
  LeagueDetail,
  LeagueSummary,
  Match,
  MatchDetail,
  ProgressionPoint,
  Scorer,
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
  scorers: (id: number | string) => request<Scorer[]>(`/api/leagues/${id}/scorers`),
  progression: (id: number | string) => request<ProgressionPoint[]>(`/api/leagues/${id}/progression`),
  forecast: (id: number | string, runs: number, seed?: number) =>
    request<ForecastResponse>(`/api/leagues/${id}/forecast`, json({ runs, ...(seed === undefined ? {} : { seed }) })),
  simulate: (id: number | string, action: 'next' | 'all' | 'reset') =>
    request<unknown>(`/api/leagues/${id}/simulate/${action}`, json()),
  club: (id: number | string) => request<ClubDetail>(`/api/clubs/${id}`),
};

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
