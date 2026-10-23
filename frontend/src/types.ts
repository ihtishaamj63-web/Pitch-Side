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
  home_xg?: number | null;
  away_xg?: number | null;
  yellow_card_count?: number;
  red_card_count?: number;
  played_at: string | null;
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

export interface MatchYellowCard {
  id: number | string;
  club_id: number | string;
  player_id: number | string;
  player_name: string;
  minute: number;
}

export type MatchRedCard = MatchYellowCard;

export type MatchFoul = MatchYellowCard;

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
}

export interface MatchDetail extends Match {
  goals: MatchGoal[];
  yellow_cards: MatchYellowCard[];
  red_cards: MatchRedCard[];
  fouls: MatchFoul[];
  team_stats: MatchTeamStats[];
  player_stats: MatchPlayerStats[];
}

export interface PlayerStat {
  rank: number;
  player_id: number | string;
  player_name: string;
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
