import type { Pool } from 'pg';
import { publishLiveClockTicks, subscribeToLeague } from '../../src/services/liveStream';

describe('shared live stream fan-out', () => {
  test('publishes one clock payload to all clients in a live league', async () => {
    const listenerA = jest.fn();
    const listenerB = jest.fn();
    const unsubscribeA = subscribeToLeague(80421, listenerA);
    const unsubscribeB = subscribeToLeague(80421, listenerB);
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ league_id: 80421 }] }),
    } as unknown as Pool;

    await publishLiveClockTicks(pool);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledWith(expect.objectContaining({ now: expect.any(String) }));
    unsubscribeA();
    unsubscribeB();
  });

  test('publishes an idle update when a live league reaches full time', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToLeague(80421, listener);
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;

    await publishLiveClockTicks(pool);

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'idle' }));
    unsubscribe();
  });
});
