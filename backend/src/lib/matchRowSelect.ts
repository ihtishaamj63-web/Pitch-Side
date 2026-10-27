export const matchRowSelect = `
  m.id, m.league_id, m.matchday, m.home_club_id, m.away_club_id,
  m.home_goals, m.away_goals, m.home_xg, m.away_xg, m.played_at,
  m.status, m.kickoff_at, m.duration_seconds, m.scheduled_at,
  h.name AS home_club_name, h.short_name AS home_short_name,
  h.colour_primary AS home_colour_primary, h.colour_secondary AS home_colour_secondary,
  a.name AS away_club_name, a.short_name AS away_short_name,
  a.colour_primary AS away_colour_primary, a.colour_secondary AS away_colour_secondary
`;
