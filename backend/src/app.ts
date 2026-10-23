import cors from 'cors';
import express from 'express';
import { ApiError, databaseErrorStatus } from './errors';
import { apiRouter } from './routes';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiRouter);

app.use((_req, _res, next) => {
  next(new ApiError('Route not found', 404));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  const databaseStatus = databaseErrorStatus(error);
  if (databaseStatus) {
    res.status(databaseStatus).json({ error: databaseStatus === 409 ? 'Resource already exists' : 'Invalid data' });
    return;
  }

  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON request body' });
    return;
  }

  console.error('Unhandled API error:', error);
  res.status(500).json({ error: 'Internal server error' });
});
