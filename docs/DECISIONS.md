# Implementation decisions

## Match clock

The API stores `kickoff_at` and `duration_seconds` for each live match. The displayed minute is derived from those values plus server time, including a short half-time pause. A one-second ticker finalizes elapsed fixtures and notifies the process-local subscriber set. Clients calibrate their clock from API payloads and never decide which events have happened.

## Event delivery

The complete deterministic match script is stored in `match_events` at kick-off. Read routes filter it using the server clock, so refreshing or reconnecting produces the same revealed history. Server-Sent Events carry lightweight clock/status updates; clients catch up through the incremental event endpoint and fall back to polling. A shared in-process fan-out avoids one database connection per browser. This is a single API instance design; horizontal scaling needs PostgreSQL `LISTEN/NOTIFY` or another shared event bus.

## Event storage

Goals, cards, fouls and substitutions share `match_events`, keyed by match and sequence. Legacy rows are copied by migration before the old tables are dropped. Aggregate match-stat tables remain for reports, while the event stream drives live visibility and score calculation.

## Simulation and calibration

The seeded simulator emits chances and outcomes in sequence, and builds scores and supporting statistics from those events. Same seed and inputs must produce the same script whether the result is watched live or finalized instantly. Unit calibration checks use repeated seeds to test mean goals, home advantage, response to team strength, and the identities `goals <= shots on target <= shots`, `team xG = sum of shot xG`, and `saves + goals = opposing shots on target`.

## Dates and fictional data

Fixtures store scheduled dates at league creation, calculated from the selected season start and matchday cadence. Kick-off time remains separate from its scheduled display date. All club, player and competition data is generated fictionally and uses no real-world badges.
