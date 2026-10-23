> **Screenshot/GIF placeholder:** add a Pitch dashboard capture here.

# Pitch

I built Pitch to explore how a small, reproducible football simulation can make a league season fun to inspect.
It turns invented club ratings into fixtures, match results, a live table, and a Monte Carlo season forecast.

## Try this

1. Open the preloaded **Demo league**.
2. Simulate the next matchday and watch the table reshuffle.
3. Open **Forecast** and run 10,000 seasons.

All club and player names, ratings, and crests are fictional. The project uses no real-world club, league, player, or badge data.

## Run locally

The quickest way is Docker Compose:

```sh
docker compose up --build
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4000/api/health>
- PostgreSQL: `localhost:5433`

Compose waits for PostgreSQL's health check before starting the API. The schema is initialized from [`sql/schema.sql`](sql/schema.sql); demo data is created automatically when the database has no leagues.

To run services outside Docker, copy `backend/.env.example` to `backend/.env`, start PostgreSQL with `docker compose up -d db`, then use separate terminals:

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
- **Pure simulation and seeded randomness:** fixture generation, table calculation, match simulation, and forecasting are deterministic functions. Injected random generators and explicit seeds make tests and forecasts reproducible.
- **Poisson goals model:** each side's goals are sampled independently from a Poisson distribution using invented attack and defence ratings and a home advantage. It has important limits: it has no form, injuries, tactics, or interaction between goals, and it is a toy model—not a prediction of real matches.
- **Forecast worker thread:** Monte Carlo work runs off the main API thread so the server can continue serving requests while a forecast is running.
- **Transactional matchday simulation:** the API locks the league row and writes every match and goal for a matchday in one transaction. Concurrent requests therefore cannot simulate the same matchday twice or leave a partial round.
- **Table tie-breaks:** points, goal difference, goals scored, then club name alphabetically without case sensitivity.

## Stack

React, TypeScript, Vite, Express 5, PostgreSQL, Docker Compose, Jest, ts-jest, and Supertest.

## CI

GitHub Actions starts PostgreSQL, runs backend unit and integration tests, then lints and builds the frontend on pushes and pull requests.
