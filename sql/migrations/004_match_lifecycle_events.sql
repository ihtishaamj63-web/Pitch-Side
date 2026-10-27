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
