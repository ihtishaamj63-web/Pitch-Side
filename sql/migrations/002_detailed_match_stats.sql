ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS home_xg NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS away_xg NUMERIC(5, 2);

CREATE TABLE IF NOT EXISTS red_cards (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fouls (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_team_stats (
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  possession INTEGER NOT NULL CHECK (possession BETWEEN 0 AND 100),
  shots INTEGER NOT NULL CHECK (shots >= 0),
  shots_on_target INTEGER NOT NULL CHECK (shots_on_target >= 0),
  corners INTEGER NOT NULL CHECK (corners >= 0),
  fouls INTEGER NOT NULL CHECK (fouls >= 0),
  saves INTEGER NOT NULL CHECK (saves >= 0),
  PRIMARY KEY (match_id, club_id),
  CHECK (shots_on_target <= shots)
);

CREATE TABLE IF NOT EXISTS player_match_stats (
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  minutes_played INTEGER NOT NULL CHECK (minutes_played BETWEEN 0 AND 90),
  shots INTEGER NOT NULL CHECK (shots >= 0),
  shots_on_target INTEGER NOT NULL CHECK (shots_on_target >= 0),
  xg NUMERIC(6, 3) NOT NULL CHECK (xg >= 0),
  key_passes INTEGER NOT NULL CHECK (key_passes >= 0),
  tackles INTEGER NOT NULL CHECK (tackles >= 0),
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE,
  CHECK (shots_on_target <= shots)
);
