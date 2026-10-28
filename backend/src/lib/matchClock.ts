export type MatchPeriod = 'scheduled' | 'first_half' | 'half_time' | 'second_half' | 'full_time';

export interface MatchClock {
  minute: number;
  minuteExtra: number;
  period: MatchPeriod;
  elapsedSeconds: number;
  isFinished: boolean;
}

export interface ClockedEvent {
  minute: number;
  minute_extra?: number;
  type: string;
}

export const HALF_TIME_PAUSE_SECONDS = 5;

export function matchClockAt(
  kickoffAt: Date | string | null,
  durationSeconds: number,
  now: Date = new Date(),
  firstHalfExtra = 0,
  secondHalfExtra = 0,
): MatchClock {
  if (!kickoffAt) return { minute: 0, minuteExtra: 0, period: 'scheduled', elapsedSeconds: 0, isFinished: false };
  const elapsedSeconds = Math.max(0, (now.getTime() - new Date(kickoffAt).getTime()) / 1000);
  const firstHalfSeconds = durationSeconds / 2;
  if (elapsedSeconds < firstHalfSeconds) {
    const firstHalfMinute = elapsedSeconds / firstHalfSeconds * (45 + firstHalfExtra);
    return {
      minute: Math.min(45, Math.floor(firstHalfMinute)),
      minuteExtra: Math.max(0, Math.floor(firstHalfMinute - 45)),
      period: 'first_half',
      elapsedSeconds,
      isFinished: false,
    };
  }
  if (elapsedSeconds < firstHalfSeconds + HALF_TIME_PAUSE_SECONDS) {
    return { minute: 45, minuteExtra: firstHalfExtra, period: 'half_time', elapsedSeconds, isFinished: false };
  }
  const secondHalfSeconds = durationSeconds / 2;
  if (elapsedSeconds < durationSeconds + HALF_TIME_PAUSE_SECONDS) {
    const secondElapsed = elapsedSeconds - firstHalfSeconds - HALF_TIME_PAUSE_SECONDS;
    const secondHalfMinute = 46 + secondElapsed / secondHalfSeconds * (44 + secondHalfExtra);
    return {
      minute: Math.min(90, Math.floor(secondHalfMinute)),
      minuteExtra: Math.max(0, Math.floor(secondHalfMinute - 90)),
      period: 'second_half',
      elapsedSeconds,
      isFinished: false,
    };
  }
  return {
    minute: 90,
    minuteExtra: secondHalfExtra,
    period: 'full_time',
    elapsedSeconds,
    isFinished: true,
  };
}

export function isEventRevealed(event: ClockedEvent, clock: MatchClock): boolean {
  if (clock.period === 'scheduled') return false;
  if (event.type === 'kickoff') return true;
  if (event.type === 'half_time') return clock.period !== 'first_half';
  if (event.type === 'second_half') return clock.period === 'second_half' || clock.period === 'full_time';
  if (event.type === 'full_time') return clock.period === 'full_time';
  const eventMinute = event.minute + (event.minute_extra ?? 0);
  const visibleMinute = clock.minute + clock.minuteExtra;
  if (event.minute <= 45) {
    return clock.period !== 'first_half' || eventMinute <= visibleMinute;
  }
  return (clock.period === 'second_half' || clock.period === 'full_time') && eventMinute <= visibleMinute;
}
