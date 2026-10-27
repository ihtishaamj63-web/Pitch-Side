ALTER TABLE player_match_stats
  ADD COLUMN IF NOT EXISTS is_starter BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS substitutions (
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
