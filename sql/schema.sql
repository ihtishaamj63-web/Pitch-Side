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
  home_xg NUMERIC(5, 2),
  away_xg NUMERIC(5, 2),
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
  assist_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE
);

CREATE TABLE yellow_cards (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE
);

CREATE TABLE red_cards (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE
);

CREATE TABLE fouls (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_id) REFERENCES players(club_id, id) ON DELETE CASCADE
);

CREATE TABLE match_team_stats (
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

CREATE TABLE player_match_stats (
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,
  is_starter BOOLEAN NOT NULL DEFAULT FALSE,
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

CREATE TABLE substitutions (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_off_id INTEGER NOT NULL,
  player_on_id INTEGER NOT NULL,
  minute INTEGER NOT NULL CHECK (minute BETWEEN 1 AND 90),
  FOREIGN KEY (club_id, player_off_id) REFERENCES players(club_id, id) ON DELETE CASCADE,
  FOREIGN KEY (club_id, player_on_id) REFERENCES players(club_id, id) ON DELETE CASCADE,
  CHECK (player_off_id <> player_on_id),
  UNIQUE (match_id, player_off_id),
  UNIQUE (match_id, player_on_id)
);

-- Snapshot of migration 004_match_lifecycle_events.sql.
ALTER TABLE matches
  ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'finished')),
  ADD COLUMN kickoff_at TIMESTAMPTZ,
  ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 5400
    CHECK (duration_seconds > 0),
  ADD COLUMN scheduled_at TIMESTAMPTZ;

UPDATE matches
SET status = 'finished', kickoff_at = played_at
WHERE home_goals IS NOT NULL;

CREATE TABLE match_events (
  id BIGSERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq > 0),
  minute INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 130),
  minute_extra INTEGER NOT NULL DEFAULT 0 CHECK (minute_extra BETWEEN 0 AND 30),
  type TEXT NOT NULL CHECK (type IN (
    'goal', 'yellow', 'red', 'foul', 'substitution', 'kickoff', 'possession_spell',
    'chance', 'shot_off_target', 'shot_blocked', 'save', 'corner', 'half_time',
    'second_half', 'full_time'
  )),
  club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  secondary_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  commentary TEXT,
  UNIQUE (match_id, seq)
);

WITH legacy_events AS (
  SELECT match_id, minute, 0 AS minute_extra, 'goal'::text AS type, club_id,
    player_id, assist_player_id AS secondary_player_id,
    jsonb_build_object('assist_player_id', assist_player_id) AS payload,
    1 AS event_order, id AS source_id
  FROM goals
  UNION ALL
  SELECT match_id, minute, 0, 'yellow', club_id, player_id, NULL::integer,
    '{}'::jsonb, 2, id FROM yellow_cards
  UNION ALL
  SELECT match_id, minute, 0, 'red', club_id, player_id, NULL::integer,
    '{}'::jsonb, 3, id FROM red_cards
  UNION ALL
  SELECT match_id, minute, 0, 'foul', club_id, player_id, NULL::integer,
    '{}'::jsonb, 4, id FROM fouls
  UNION ALL
  SELECT match_id, minute, 0, 'substitution', club_id, player_on_id, player_off_id,
    jsonb_build_object('player_on_id', player_on_id, 'player_off_id', player_off_id),
    5, id FROM substitutions
), sequenced_events AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY match_id ORDER BY minute, event_order, source_id
  )::integer AS seq
  FROM legacy_events
)
INSERT INTO match_events
  (match_id, seq, minute, minute_extra, type, club_id, player_id, secondary_player_id, payload)
SELECT match_id, seq, minute, minute_extra, type, club_id, player_id,
  secondary_player_id, payload
FROM sequenced_events
ORDER BY match_id, seq;

DROP TABLE goals, yellow_cards, red_cards, fouls, substitutions;

CREATE INDEX match_events_match_seq_idx ON match_events (match_id, seq);
CREATE INDEX match_events_type_player_idx ON match_events (type, player_id, match_id);

CREATE TABLE schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (filename) VALUES
  ('001_match_events.sql'),
  ('002_detailed_match_stats.sql'),
  ('003_match_lineups.sql'),
  ('004_match_lifecycle_events.sql');