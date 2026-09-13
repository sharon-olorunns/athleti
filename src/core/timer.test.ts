import { describe, expect, it } from 'vitest';
import {
  adjustTimer,
  advanceInterval,
  contextLabelFor,
  createTimer,
  formatCountdown,
  hasElapsed,
  isFinalCountdown,
  overdueLabel,
  overdueMs,
  pauseTimer,
  progress,
  remainingMs,
  remainingSeconds,
  resumeTimer,
} from './timer';

const T0 = 1_700_000_000_000;
const rest = (seconds = 90, now = T0) =>
  createTimer({ mode: 'rest', totalSeconds: seconds, contextLabel: 'Squat · set 2 of 4', now });

describe('createTimer', () => {
  it('stores an absolute end time rather than a duration to count down', () => {
    const timer = rest(90);
    expect(timer.endsAt).toBe(T0 + 90_000);
    expect(timer.totalSeconds).toBe(90);
    expect(timer.paused).toBe(false);
    expect(timer.mode).toBe('rest');
  });

  it('starts an interval on round 1 of the work phase', () => {
    const timer = createTimer({
      mode: 'interval',
      totalSeconds: 0,
      contextLabel: 'Conditioning',
      now: T0,
      interval: { workSeconds: 20, restSeconds: 40, rounds: 8 },
    });
    expect(timer.interval).toEqual({ round: 1, totalRounds: 8, phase: 'work' });
    // The work period is what runs first, whatever totalSeconds was passed.
    expect(timer.totalSeconds).toBe(20);
    expect(timer.endsAt).toBe(T0 + 20_000);
  });

  it('leaves interval off a plain rest timer', () => {
    expect(rest().interval).toBeUndefined();
  });
});

describe('remaining time', () => {
  it('is derived from the clock, not from ticks', () => {
    const timer = rest(90);
    expect(remainingMs(timer, T0)).toBe(90_000);
    expect(remainingMs(timer, T0 + 30_000)).toBe(60_000);
  });

  /**
   * Acceptance criterion 5: lock the phone for 60 seconds during a 90-second
   * rest, reopen, and roughly 30 seconds remain — not 90, and not a stopped
   * timer. No ticks run while the tab is suspended, so this must hold purely
   * from the timestamps.
   */
  it('is correct after 60 seconds with no ticks at all', () => {
    const timer = rest(90);
    expect(remainingSeconds(timer, T0 + 60_000)).toBe(30);
  });

  it('never goes negative', () => {
    expect(remainingMs(rest(90), T0 + 200_000)).toBe(0);
    expect(remainingSeconds(rest(90), T0 + 200_000)).toBe(0);
  });

  it('rounds seconds up, so a fresh 90s timer reads 90 and not 89', () => {
    const timer = rest(90);
    expect(remainingSeconds(timer, T0)).toBe(90);
    expect(remainingSeconds(timer, T0 + 1)).toBe(90);
    expect(remainingSeconds(timer, T0 + 1000)).toBe(89);
  });
});

describe('hasElapsed and overdue', () => {
  it('elapses exactly at the end time', () => {
    const timer = rest(90);
    expect(hasElapsed(timer, T0 + 89_999)).toBe(false);
    expect(hasElapsed(timer, T0 + 90_000)).toBe(true);
  });

  /**
   * Acceptance criterion 6: a rest that elapsed while the app was backgrounded
   * must report that it finished, and how long ago.
   */
  it('reports how long ago a timer finished', () => {
    const timer = rest(90);
    expect(overdueMs(timer, T0 + 130_000)).toBe(40_000);
    expect(overdueLabel(overdueMs(timer, T0 + 130_000))).toBe('40s ago');
  });

  it('is not overdue before it elapses', () => {
    expect(overdueMs(rest(90), T0 + 10_000)).toBe(0);
  });

  it('does not elapse or age while paused', () => {
    const paused = pauseTimer(rest(90), T0 + 10_000);
    expect(hasElapsed(paused, T0 + 500_000)).toBe(false);
    expect(overdueMs(paused, T0 + 500_000)).toBe(0);
  });
});

describe('progress', () => {
  it('runs from 0 to 1 across the countdown', () => {
    const timer = rest(90);
    expect(progress(timer, T0)).toBe(0);
    expect(progress(timer, T0 + 45_000)).toBeCloseTo(0.5);
    expect(progress(timer, T0 + 90_000)).toBe(1);
  });

  it('clamps past the end', () => {
    expect(progress(rest(90), T0 + 200_000)).toBe(1);
  });

  it('is complete for a zero-length timer rather than dividing by zero', () => {
    expect(progress(rest(0), T0)).toBe(1);
  });
});

describe('isFinalCountdown', () => {
  it('turns on for the last ten seconds', () => {
    const timer = rest(90);
    expect(isFinalCountdown(timer, T0 + 79_000)).toBe(false);
    expect(isFinalCountdown(timer, T0 + 80_000)).toBe(true);
    expect(isFinalCountdown(timer, T0 + 89_500)).toBe(true);
  });

  it('turns off once the timer is done', () => {
    expect(isFinalCountdown(rest(90), T0 + 90_000)).toBe(false);
  });
});

describe('pause and resume', () => {
  it('freezes the remaining time', () => {
    const paused = pauseTimer(rest(90), T0 + 30_000);
    expect(paused.paused).toBe(true);
    expect(paused.remainingWhenPaused).toBe(60_000);
    // Time passing while paused changes nothing.
    expect(remainingMs(paused, T0 + 300_000)).toBe(60_000);
  });

  it('resumes from where it stopped, not from where it would have been', () => {
    const paused = pauseTimer(rest(90), T0 + 30_000);
    const resumed = resumeTimer(paused, T0 + 300_000);
    expect(resumed.paused).toBe(false);
    expect(resumed.endsAt).toBe(T0 + 360_000);
    expect(remainingMs(resumed, T0 + 300_000)).toBe(60_000);
  });

  it('drops the paused remainder once resumed', () => {
    const resumed = resumeTimer(pauseTimer(rest(90), T0 + 30_000), T0 + 40_000);
    expect('remainingWhenPaused' in resumed).toBe(false);
  });

  it('survives repeated pause and resume without drift', () => {
    let timer = rest(90);
    timer = pauseTimer(timer, T0 + 10_000);
    timer = resumeTimer(timer, T0 + 50_000);
    timer = pauseTimer(timer, T0 + 60_000);
    timer = resumeTimer(timer, T0 + 100_000);
    // 20 seconds of running time used, 70 left.
    expect(remainingMs(timer, T0 + 100_000)).toBe(70_000);
  });

  it('ignores pausing twice or resuming a running timer', () => {
    const paused = pauseTimer(rest(90), T0 + 10_000);
    expect(pauseTimer(paused, T0 + 20_000)).toBe(paused);
    const running = rest(90);
    expect(resumeTimer(running, T0)).toBe(running);
  });
});

describe('adjustTimer', () => {
  it('adds fifteen seconds to the remaining time and the total', () => {
    const timer = adjustTimer(rest(90), 15, T0 + 30_000);
    expect(remainingMs(timer, T0 + 30_000)).toBe(75_000);
    expect(timer.totalSeconds).toBe(105);
  });

  it('takes fifteen seconds off', () => {
    const timer = adjustTimer(rest(90), -15, T0 + 30_000);
    expect(remainingMs(timer, T0 + 30_000)).toBe(45_000);
    expect(timer.totalSeconds).toBe(75);
  });

  it('never drops below zero, and the ring stays truthful', () => {
    const timer = adjustTimer(rest(90), -15, T0 + 85_000);
    expect(remainingMs(timer, T0 + 85_000)).toBe(0);
    // Only 5s were actually removed, so the total reflects that.
    expect(timer.totalSeconds).toBe(85);
    expect(progress(timer, T0 + 85_000)).toBe(1);
  });

  it('adjusts a paused timer without restarting it', () => {
    const paused = pauseTimer(rest(90), T0 + 30_000);
    const adjusted = adjustTimer(paused, 15, T0 + 45_000);
    expect(adjusted.paused).toBe(true);
    expect(remainingMs(adjusted, T0 + 999_999)).toBe(75_000);
  });
});

describe('advanceInterval', () => {
  const spec = { workSeconds: 20, restSeconds: 40, rounds: 8 };
  const start = createTimer({
    mode: 'interval',
    totalSeconds: 0,
    contextLabel: 'Conditioning',
    now: T0,
    interval: spec,
  });

  it('goes from work into rest on the same round', () => {
    const next = advanceInterval(start, spec, T0 + 20_000);
    expect(next?.interval).toEqual({ round: 1, totalRounds: 8, phase: 'rest' });
    expect(next?.totalSeconds).toBe(40);
    expect(next?.endsAt).toBe(T0 + 60_000);
  });

  it('goes from rest into the next round of work', () => {
    const resting = advanceInterval(start, spec, T0 + 20_000);
    const working = advanceInterval(resting!, spec, T0 + 60_000);
    expect(working?.interval).toEqual({ round: 2, totalRounds: 8, phase: 'work' });
    expect(working?.totalSeconds).toBe(20);
  });

  it('finishes at the end of the final work period, with no trailing rest', () => {
    const lastWork: typeof start = {
      ...start,
      interval: { round: 8, totalRounds: 8, phase: 'work' },
    };
    expect(advanceInterval(lastWork, spec, T0)).toBeUndefined();
  });

  it('runs the full eight rounds through every transition', () => {
    let timer: typeof start | undefined = start;
    const phases: string[] = [];
    let now = T0;
    for (let guard = 0; guard < 50 && timer !== undefined; guard += 1) {
      phases.push(`${timer.interval?.round}${timer.interval?.phase[0]}`);
      now = timer.endsAt;
      timer = advanceInterval(timer, spec, now);
    }
    expect(phases[0]).toBe('1w');
    expect(phases[1]).toBe('1r');
    expect(phases.at(-1)).toBe('8w');
    // 8 work periods and 7 rests between them.
    expect(phases).toHaveLength(15);
  });

  it('is undefined for a timer that is not an interval', () => {
    expect(advanceInterval(rest(90), spec, T0)).toBeUndefined();
  });
});

describe('formatCountdown', () => {
  it('shows bare seconds under a minute', () => {
    expect(formatCountdown(45)).toBe('45');
    expect(formatCountdown(9)).toBe('9');
  });

  it('shows m:ss at a minute and over', () => {
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(125)).toBe('2:05');
  });

  it('never shows negative time', () => {
    expect(formatCountdown(-5)).toBe('0');
  });
});

describe('overdueLabel', () => {
  it('reads in seconds, then minutes, then hours', () => {
    expect(overdueLabel(40_000)).toBe('40s ago');
    expect(overdueLabel(125_000)).toBe('2m ago');
    expect(overdueLabel(7_500_000)).toBe('2h ago');
  });
});

describe('contextLabelFor', () => {
  it('reads as the spec writes it', () => {
    expect(contextLabelFor('Trap bar deadlift', 2, 4)).toBe('Trap bar deadlift · set 2 of 4');
  });
});
