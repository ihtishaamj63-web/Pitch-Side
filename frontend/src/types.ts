export interface LeagueSummary {
  id: number | string;
  name: string;
  season_label: string;
  club_count: number;
  played_matches: number;
  total_matches: number;
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
  played_at: string | null;
}

export interface MatchGoal {
  id: number | string;
  club_id: number | string;
  player_id: number | string;
  player_name: string;
  minute: number;
}

export interface MatchDetail extends Match {
  goals: MatchGoal[];
}

export interface Scorer {
  rank: number;
  player_id: number | string;
  player_name: string;
  club_id: number | string;
  club_name: string;
  short_name: string;
  goals: number;
}

export interface ProgressionPoint {
  matchday: number;
  positions: Array<{ club_id: number | string; position: number }>;
}

export interface ForecastResult {
  club_id: number | string;
  positions: Record<string, number>;
  title_probability: number;
  top_zone_probability: number;
  bottom_zone_probability: number;
}

export interface ForecastResponse {
  results: ForecastResult[];
  duration_ms: number;
}

export interface LeagueDetail {
  league: Pick<LeagueSummary, 'id' | 'name' | 'season_label'> & Partial<Pick<LeagueSummary, 'club_count' | 'played_matches' | 'total_matches'>> & {
    points_win?: number;
    points_draw?: number;
    top_zone?: number;
    bottom_zone?: number;
  };
  clubs: Club[];
  progress: { played_matches?: number; total_matches?: number; played?: number; total?: number; percentage?: number } | number;
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
  clubs: Array<Omit<Club, 'id'> & { attack: number; defence: number }>;
}
