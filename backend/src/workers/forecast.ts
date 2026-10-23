import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { runForecast } from '../lib';

export type ForecastInput = Parameters<typeof runForecast>[0];
export type ForecastResult = ReturnType<typeof runForecast>;
type ForecastWorkerMessage = { result: ForecastResult } | { error: string };

export function runForecastInWorker(input: ForecastInput): Promise<ForecastResult> {
  const extension = __filename.endsWith('.ts') ? '.ts' : '.js';
  const workerPath = path.join(__dirname, `forecastWorker${extension}`);

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: input,
      execArgv: process.execArgv.length > 0
        ? process.execArgv
        : extension === '.ts' ? ['--import', 'tsx'] : [],
    });
    worker.once('message', (message: ForecastWorkerMessage) => {
      if ('error' in message) reject(new Error(message.error));
      else resolve(message.result);
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Forecast worker exited with code ${code}`));
    });
  });
}
