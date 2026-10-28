# Pitch-Side

Pitch-Side is a fictional football league simulator. Create a league, follow every matchday live, and explore match reports, standings, player statistics, awards and club profiles.

## Try this

1. Open the preloaded **Demo league**.
2. Choose a team to manage, set its tactics and simulate the next matchday.
3. Open **Player statistics** to rank players by goals, assists, xG, key passes, tackles, cards or goal contributions per 90 minutes. Open a player for their season record and match log.

Your managed team and tactical approach are saved per league in your browser. While managing a team, simulate one matchday at a time so your tactics are applied to each fixture.

The Live hub follows every fixture in the current round. Match pages show the server clock, revealed commentary, match stats and line-ups, then become the final report. Live speed is configurable with `LIVE_SPEED_QUICK_SECONDS`, `LIVE_SPEED_STANDARD_SECONDS` and `LIVE_SPEED_EXTENDED_SECONDS`; instant simulation remains available for a full season. Notifications are stored per league in the browser and can be limited to the followed team or goals only.

League routes include `/leagues/:id/table`, `/leagues/:id/fixtures`, `/leagues/:id/live`, `/leagues/:id/stats` and `/leagues/:id/awards`. Match, club and player pages live at `/matches/:id`, `/clubs/:id` and `/players/:id`.

All club and player names, ratings, and crests are fictional. The project uses no real-world club, league, player, or badge data.

## Run locally

The quickest way is Docker Compose:

```sh
docker compose up --build
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4000/api/health>
- PostgreSQL: `localhost:5433`

Compose waits for PostgreSQL's health check before starting the API. The schema is initialized from [`sql/schema.sql`](sql/schema.sql); demo data is created automatically when the database has no leagues. On startup, the API automatically applies pending SQL files from [`sql/migrations/`](sql/migrations) so existing database volumes receive schema updates too.

For local development, run `npm run dev` from the repository root. It starts the PostgreSQL container, then starts the API and web app in watch mode. Docker must be installed and running.

To run only the API outside the root launcher, copy `backend/.env.example` to `backend/.env` and start PostgreSQL first:

```sh
docker compose up -d db
```

Then start the backend and frontend in separate terminals:

```sh
cd backend
npm ci
npm run dev
```

```sh
cd frontend
npm ci
npm run dev
```

Set `VITE_API_URL` in `frontend/.env` to change the frontend API address. The footer portfolio link can be configured with `VITE_PORTFOLIO_URL`.

## Tests

Backend unit tests do not require a database:

```sh
cd backend
npm run test:unit
```

The full backend suite also runs integration tests against a separate `pitch_test` database. It creates that database when needed and recreates its schema before testing:

```sh
npm test
```

Frontend checks:

```sh
cd frontend
npm run lint
npm run build
```

## Design decisions

- **Circle-method fixtures:** the circle method creates a balanced round-robin schedule; the second half swaps every home and away venue.
- **Pure simulation and seeded randomness:** fixture generation, table calculation, and match simulation are deterministic functions. Injected random generators and explicit seeds make tests reproducible.
- **Match simulation:** seeded results include goals and assists, cards, fouls, expected goals, shots, possession, corners, saves, key passes and tackles. Supporting statistics are generated consistently for the fixture and its player leaders; they are illustrative, not a prediction or tracking-data model.
- **Transactional matchday simulation:** the API locks the league row and writes every match and match event for a matchday in one transaction. Concurrent requests therefore cannot simulate the same matchday twice or leave a partial round.
- **Table tie-breaks:** points, goal difference, goals scored, then club name alphabetically without case sensitivity.
- **Live delivery:** one in-process ticker fans clock updates out to all SSE clients. Each client can poll snapshots and incremental events if streaming fails. This expects one API instance; use PostgreSQL `LISTEN/NOTIFY` or a shared event bus before horizontal scaling.
- **Spoiler safety:** match events are stored as a deterministic full script at kick-off, but read endpoints derive the visible score and stats from the server clock and only return events whose minute has elapsed.
- **Clock model:** elapsed real time maps to match time over the configured duration, with a short half-time pause. Restarting the API does not change the clock because kick-off time and duration are stored in PostgreSQL.
- **Event model:** `match_events` is the source for goals, cards, fouls and substitutions. Player and team aggregate tables support reports; event history remains the source of truth for live reveal.
- **Calibration:** seeded tests check score range, home advantage, strength response and consistency between goals, shots, xG and saves. The fictional simulator is for entertainment and is not intended to model real football precisely.

## Stack

React, TypeScript, Vite, Express 5, PostgreSQL, Docker Compose, Jest, ts-jest, and Supertest.

## CI

GitHub Actions starts PostgreSQL, runs backend unit and integration tests, then lints and builds the frontend on pushes and pull requests.
