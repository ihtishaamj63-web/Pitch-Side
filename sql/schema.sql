CREATE TABLE leagues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  season_label VARCHAR(50) NOT NULL,
  points_win INTEGER NOT NULL DEFAULT 3 CHECK (points_win > 0),
  points_draw INTEGER NOT NULL DEFAULT 1 CHECK (points_draw >= 0),
  top_zone INTEGER NOT NULL DEFAULT 4 CHECK (top_zone >= 0),
  bottom_zone INTEGER NOT NULL DEFAULT 3 CHECK (bottom_zone >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clubs (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  short_name CHAR(3) NOT NULL CHECK (short_name ~ '^[A-Za-z]{3}$'),
  colour_primary VARCHAR(7) NOT NULL CHECK (colour_primary ~ '^#[0-9A-Fa-f]{6}$'),
  colour_secondary VARCHAR(7) NOT NULL CHECK (colour_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  attack INTEGER NOT NULL CHECK (attack BETWEEN 1 AND 100),
  defence INTEGER NOT NULL CHECK (defence BETWEEN 1 AND 100),
  UNIQUE (league_id, id),
  UNIQUE (league_id, name),
  UNIQUE (league_id, short_name)
);

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  position VARCHAR(3) NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  UNIQUE (club_id, id)
);

CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  matchday INTEGER NOT NULL CHECK (matchday >= 1),
  home_club_id INTEGER NOT NULL,
  away_club_id INTEGER NOT NULL,
  home_goals INTEGER,
  away_goals INTEGER,
  played_at TIMESTAMPTZ,
  CHECK (home_club_id <> away_club_id),
  CHECK ((home_goals IS NULL) = (away_goals IS NULL)),
  CHECK (home_goals IS NULL OR home_goals >= 0),
  CHECK (away_goals IS NULL OR away_goals >= 0),
  FOREIGN KEY (league_id, home_club_id)
    REFERENCES clubs(league_id, id) ON DELETE CASCADE,
  FOREIGN KEY (league_id, away_club_id)
    REFERENCES clubs(league_id, id) ON DELETE CASCADE,
  UNIQUE (league_id, home_club_id, away_club_id)
);

CREATE INDEX matches_league_matchday_idx ON matches (league_id, matchday);

CREATE TABLE goals (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE
);
