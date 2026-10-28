import { isEventRevealed, matchClockAt } from '../../src/lib/matchClock';

describe('server match clock', () => {
  const kickoff = new Date('2026-10-28T12:00:00.000Z');
  const at = (seconds: number) => new Date(kickoff.getTime() + seconds * 1_000);

  it('accounts for the half-time pause and stoppage time', () => {
    expect(matchClockAt(kickoff, 120, at(30), 2, 3)).toMatchObject({
      minute: 23,
      period: 'first_half',
      isFinished: false,
    });
    expect(matchClockAt(kickoff, 120, at(60), 2, 3)).toMatchObject({
      minute: 45,
      minuteExtra: 2,
      period: 'half_time',
    });
    expect(matchClockAt(kickoff, 120, at(65), 2, 3)).toMatchObject({
      minute: 46,
      period: 'second_half',
    });
    expect(matchClockAt(kickoff, 120, at(125), 2, 3)).toMatchObject({
      minute: 90,
      minuteExtra: 3,
      period: 'full_time',
      isFinished: true,
    });
  });

  it('never reveals events ahead of the server clock', () => {
    const firstHalf = matchClockAt(kickoff, 120, at(20), 2, 3);
    expect(isEventRevealed({ type: 'goal', minute: 15 }, firstHalf)).toBe(true);
    expect(isEventRevealed({ type: 'goal', minute: 16 }, firstHalf)).toBe(false);
    expect(isEventRevealed({ type: 'goal', minute: 45, minute_extra: 1 }, firstHalf)).toBe(false);
    expect(isEventRevealed({ type: 'goal', minute: 46 }, firstHalf)).toBe(false);

    const halfTime = matchClockAt(kickoff, 120, at(62), 2, 3);
    expect(isEventRevealed({ type: 'half_time', minute: 45, minute_extra: 2 }, halfTime)).toBe(true);
    expect(isEventRevealed({ type: 'second_half', minute: 46 }, halfTime)).toBe(false);

    const secondHalf = matchClockAt(kickoff, 120, at(75), 2, 3);
    expect(isEventRevealed({ type: 'second_half', minute: 46 }, secondHalf)).toBe(true);
    expect(isEventRevealed({ type: 'goal', minute: 80 }, secondHalf)).toBe(false);
    expect(isEventRevealed({ type: 'full_time', minute: 90, minute_extra: 3 }, secondHalf)).toBe(false);
  });
});
