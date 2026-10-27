import type { Club, Match, MatchDetail } from '../types';

export type MatchEventType = 'goal' | 'yellow' | 'red' | 'foul' | 'substitution';

export interface MatchEvent {
  id: number | string;
  club_id: number | string;
  player_name: string;
  minute: number;
  eventType: MatchEventType;
  assist_player_name?: string | null;
  player_off_name?: string;
}

export function getMatchEvents(match: MatchDetail): MatchEvent[] {
  return [
    ...(match.goals ?? []).map(goal => ({ ...goal, eventType: 'goal' as const })),
    ...(match.yellow_cards ?? []).map(card => ({ ...card, eventType: 'yellow' as const })),
    ...(match.red_cards ?? []).map(card => ({ ...card, eventType: 'red' as const })),
    ...(match.fouls ?? []).map(foul => ({ ...foul, eventType: 'foul' as const })),
    ...(match.substitutions ?? []).map(substitution => ({
      id: substitution.id,
      club_id: substitution.club_id,
      player_name: substitution.player_on_name,
      player_off_name: substitution.player_off_name,
      minute: substitution.minute,
      eventType: 'substitution' as const,
    })),
  ].sort((left, right) => left.minute - right.minute);
}

export function eventLabel(event: MatchEvent): string {
  if (event.eventType === 'goal') return event.assist_player_name ? `GOAL · ASSIST: ${event.assist_player_name}` : 'GOAL · UNASSISTED';
  if (event.eventType === 'yellow') return 'YELLOW CARD';
  if (event.eventType === 'red') return 'RED CARD';
  if (event.eventType === 'substitution') return `SUBSTITUTION · ${event.player_name} on for ${event.player_off_name}`;
  return 'FOUL';
}

export function clubFromMatch(match: Match, side: 'home' | 'away'): Club {
  if (side === 'home') {
    return {
      id: match.home_club_id,
      name: match.home_club_name,
      short_name: match.home_short_name,
      colour_primary: match.home_colour_primary,
      colour_secondary: match.home_colour_secondary,
    };
  }
  return {
    id: match.away_club_id,
    name: match.away_club_name,
    short_name: match.away_short_name,
    colour_primary: match.away_colour_primary,
    colour_secondary: match.away_colour_secondary,
  };
}

export function totalMatchdays(clubCount: number): number {
  return clubCount % 2 === 0 ? 2 * (clubCount - 1) : 2 * clubCount;
}
