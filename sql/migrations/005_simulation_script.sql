ALTER TABLE matches
  ALTER COLUMN home_xg TYPE NUMERIC(7, 3),
  ALTER COLUMN away_xg TYPE NUMERIC(7, 3),
  ADD COLUMN simulation_result JSONB;
