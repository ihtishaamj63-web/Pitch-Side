import { parentPort, workerData } from 'node:worker_threads';
import { runForecast } from '../lib';
import type { ForecastInput } from './forecast';

if (!parentPort) throw new Error('Forecast worker requires a parent thread');

try {
  const result = runForecast(workerData as ForecastInput);
  parentPort.postMessage({ result });
} catch (error) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : 'Forecast failed',
  });
}
