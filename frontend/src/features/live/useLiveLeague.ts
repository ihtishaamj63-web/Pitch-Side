import { useEffect, useState } from 'react';
import { api, type LiveMatchUpdate } from '../../api';
import type { Match, MatchEvent } from '../../types';

export interface RevealedLiveEvent {
  matchId: number | string;
  homeName: string;
  awayName: string;
  event: MatchEvent;
}

export interface LiveLeagueState {
  matches: Match[];
  matchday: number | null;
  serverOffsetMs: number;
  connected: boolean;
  recentEvents: RevealedLiveEvent[];
}

/** Uses the server clock stream when available and falls back to a two-second snapshot poll. */
export function useLiveLeague(leagueId: string) {
  const [state, setState] = useState<LiveLeagueState>({ matches: [], matchday: null, serverOffsetMs: 0, connected: false, recentEvents: [] });

  useEffect(() => {
    if (!leagueId) return;
    let disposed = false;
    let pollTimer = 0;
    let source: EventSource | null = null;
    let fallback = false;
    let refreshInFlight = false;
    const eventCursors = new Map<string, number>();

    const refresh = async () => {
      if (refreshInFlight || disposed) return;
      refreshInFlight = true;
      try {
        const snapshot = await api.live(leagueId);
        if (disposed) return;
        const updates = await Promise.all(snapshot.matches.map(async match => {
          const key = String(match.id);
          const cursor = eventCursors.get(key);
          const update = await api.matchLive(match.id, cursor ?? 0);
          eventCursors.set(key, Math.max(cursor ?? 0, ...update.events.map(event => event.seq)));
          return cursor === undefined ? [] : update.events.map(event => ({
            matchId: match.id, homeName: match.home_club_name, awayName: match.away_club_name, event,
          }));
        }));
        if (!disposed) setState(current => ({ ...current, matches: snapshot.matches, matchday: snapshot.matchday, recentEvents: updates.flat() }));
      } catch {
        if (!disposed) setState(current => ({ ...current, connected: false }));
      } finally {
        refreshInFlight = false;
      }
    };
    const startFallback = () => {
      if (fallback || disposed) return;
      fallback = true;
      setState(current => ({ ...current, connected: false }));
      void refresh();
      pollTimer = window.setInterval(() => void refresh(), 2_000);
    };
    const stopFallback = () => {
      if (!fallback) return;
      fallback = false;
      window.clearInterval(pollTimer);
      pollTimer = 0;
    };

    void refresh();
    if (typeof EventSource !== 'undefined') {
      source = new EventSource(api.liveStreamUrl(leagueId));
      source.addEventListener('open', () => {
        stopFallback();
        if (!disposed) setState(current => ({ ...current, connected: true }));
      });
      source.addEventListener('clock', event => {
        const message = event as MessageEvent<string>;
        try {
          const payload = JSON.parse(message.data) as { now: string };
          if (!disposed) {
            setState(current => ({ ...current, serverOffsetMs: new Date(payload.now).getTime() - Date.now(), connected: true }));
            void refresh();
          }
        } catch { /* Ignore malformed stream frames and keep the connection alive. */ }
      });
      source.addEventListener('error', startFallback);
    } else {
      startFallback();
    }

    return () => {
      disposed = true;
      source?.close();
      window.clearInterval(pollTimer);
    };
  }, [leagueId]);

  return state;
}

export function getNextEventCursor(events: LiveMatchUpdate['events']): number {
  return events.reduce((cursor, event) => Math.max(cursor, event.seq), 0);
}
