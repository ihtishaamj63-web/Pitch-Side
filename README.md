> **Screenshot/GIF placeholder:** add a Pitch dashboard capture here.

# Pitch

Pitch is a small football league simulator for creating competitions and following a season.
It turns invented club ratings into fixtures, match reports, a live table, and player leaderboards.

## Try this

1. Open the preloaded **Demo league**.
2. Simulate the next matchday and review the scores, goal involvements and bookings.
3. Open **League leaders** for goals, assists, cards, fouls, xG, shots and other player stats.

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

## Stack

React, TypeScript, Vite, Express 5, PostgreSQL, Docker Compose, Jest, ts-jest, and Supertest.

## CI

GitHub Actions starts PostgreSQL, runs backend unit and integration tests, then lints and builds the frontend on pushes and pull requests.
