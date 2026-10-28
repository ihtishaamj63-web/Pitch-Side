export interface LeagueSummary {
  id: number | string;
  name: string;
  season_label: string;
  club_count: number;
  played_matches: number;
  total_matches: number;
}

export type Tactics = 'attacking' | 'balanced' | 'defensive';

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

export interface Club {
  id: number | string;
  name: string;
  short_name: string;
  colour_primary: string;
  colour_secondary: string;
  attack?: number;
  defence?: number;
}

export interface Standing extends Club {
  position: number;
  movement?: number;
  live?: boolean;
  club_id: number | string;
  club_name: string;
  P: number;
  W: number;
  D: number;
  L: number;
  GF: number;
  GA: number;
  GD: number;
  Pts: number;
  form: string;
}

export interface Match {
  id: number | string;
  league_id?: number | string;
  matchday: number;
  home_club_id: number | string;
  away_club_id: number | string;
  home_club_name: string;
  away_club_name: string;
  home_short_name: string;
  away_short_name: string;
  home_colour_primary: string;
  home_colour_secondary: string;
  away_colour_primary: string;
  away_colour_secondary: string;
  home_goals: number | null;
  away_goals: number | null;
  status?: 'scheduled' | 'live' | 'finished';
  kickoff_at?: string | null;
  duration_seconds?: number;
  scheduled_at?: string | null;
  minute?: number | null;
  minute_extra?: number | null;
  period?: 'scheduled' | 'first_half' | 'half_time' | 'second_half' | 'full_time' | null;
  clock?: { minute: number; minute_extra: number; period: string } | null;
  home_xg?: number | null;
  away_xg?: number | null;
  yellow_card_count?: number;
  red_card_count?: number;
  played_at: string | null;
  last_event?: MatchEvent | null;
  goal_events?: Array<Pick<MatchGoal, 'club_id' | 'player_name' | 'assist_player_name' | 'minute'>>;
}

export interface MatchGoal {
  id: number | string;
  club_id: number | string;
  player_id: number | string;
  player_name: string;
  assist_player_id: number | string | null;
  assist_player_name: string | null;
  minute: number;
}

export interface MatchPersonEvent {
  id: number | string;
  club_id: number | string;
  player_id: number | string;
  player_name: string;
  minute: number;
}

export interface MatchSubstitution {
  id: number | string;
  club_id: number | string;
  player_off_id: number | string;
  player_off_name: string;
  player_on_id: number | string;
  player_on_name: string;
  minute: number;
}

export interface MatchTeamStats {
  club_id: number | string;
  possession: number;
  shots: number;
  shots_on_target: number;
  corners: number;
  fouls: number;
  saves: number;
  xg: number | string;
}

export interface MatchPlayerStats {
  club_id: number | string;
  player_id: number | string;
  player_name: string;
  position: string;
  minutes_played: number;
  shots: number;
  shots_on_target: number;
  xg: number | string;
  key_passes: number;
  tackles: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  fouls: number;
  is_starter: boolean;
}

export interface MatchDetail extends Match {
  lineups?: Array<{ club_id: number | string; player_id: number | string; player_name: string; position: string; is_starter: boolean }>;
  events: MatchEvent[];
  goals: MatchGoal[];
  yellow_cards: MatchPersonEvent[];
  red_cards: MatchPersonEvent[];
  fouls: MatchPersonEvent[];
  substitutions: MatchSubstitution[];
  team_stats: MatchTeamStats[];
  player_stats: MatchPlayerStats[];
}

export interface MatchEvent {
  id: number | string;
  seq: number;
  minute: number;
  minute_extra: number;
  type: string;
  club_id: number | string | null;
  player_id: number | string | null;
  secondary_player_id: number | string | null;
  player_name?: string | null;
  secondary_player_name?: string | null;
  payload: Record<string, number | string | boolean | null>;
  commentary: string | null;
}

export interface PlayerStat {
  rank: number;
  player_id: number | string;
  player_name: string;
  position: string;
  club_id: number | string;
  club_name: string;
  short_name: string;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  fouls: number;
  appearances: number;
  minutes: number;
  shots: number;
  shots_on_target: number;
  xg: number | string;
  key_passes: number;
  tackles: number;
}

export interface PlayerProfile {
  player: { id: number | string; name: string; position: string; club_id: number | string; club_name: string; short_name: string; colour_primary: string; colour_secondary: string; league_id: number | string; league_name: string; season_label: string };
  matches: Array<{ id: number | string; matchday: number; home_goals: number; away_goals: number; home_club_id: number | string; home_club_name: string; away_club_id: number | string; away_club_name: string; minutes_played: number; shots: number; shots_on_target: number; xg: number | string; key_passes: number; tackles: number; goals: number; assists: number; goals_timeline: Array<{ minute: number; minute_extra: number; type: string }>; rating: string }>;
}

export interface LeagueDetail {
  league: Pick<LeagueSummary, 'id' | 'name' | 'season_label'> & Partial<Pick<LeagueSummary, 'club_count' | 'played_matches' | 'total_matches'>> & {
    points_win?: number;
    points_draw?: number;
    top_zone?: number;
    bottom_zone?: number;
  };
  clubs: Club[];
  progress: { played_matches?: number; total_matches?: number; completed_matchdays?: number };
}

export interface ClubDetail {
  club: Club;
  league: Pick<LeagueSummary, 'id' | 'name' | 'season_label'>;
  squad: Array<{ id: number | string; name: string; position?: string; goals?: number }>;
  form: string | string[];
  fixtures: Match[];
}

export interface CreateLeaguePayload {
  name: string;
  season_label: string;
  points_win: number;
  points_draw: number;
  top_zone: number;
  bottom_zone: number;
  season_start_date?: string;
  matchday_cadence_days?: number;
  clubs: Array<Omit<Club, 'id'> & { attack: number; defence: number }>;
}
