import { mulberry32 } from '../../src/lib/random';

describe('mulberry32', () => {
  it('produces the same stream for the same seed', () => {
    const first = mulberry32(12345);
    const second = mulberry32(12345);

    expect(Array.from({ length: 5 }, () => first())).toEqual(
      Array.from({ length: 5 }, () => second()),
    );
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(0);
    for (let index = 0; index < 100; index += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
