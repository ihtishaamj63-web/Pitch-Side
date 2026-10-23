import { Router } from 'express';
import { clubsRouter } from './clubs';
import { leaguesRouter } from './leagues';
import { matchesRouter } from './matches';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'OK', service: 'pitch-api' });
});
apiRouter.use(leaguesRouter);
apiRouter.use(matchesRouter);
apiRouter.use(clubsRouter);
