/**
 * The ±15s rule, which the spec gives two jobs: move the running countdown, and
 * set the rest for the remaining sets of that exercise in this session only.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { remainingMs } from '@/core/timer';
import { useTimer } from './timerStore';

beforeEach(async () => {
  await db.delete();
  await db.open();
  useTimer.setState({ timer: undefined, restOverrides: {}, expanded: false });
});

const start = () =>
  useTimer.getState().startRest({
    seconds: 90,
    contextLabel: 'Trap bar deadlift · set 1 of 4',
    exerciseId: 'trap-bar-deadlift',
  });

describe('startRest', () => {
  it('stores an absolute end time and persists it', async () => {
    await start();
    const timer = useTimer.getState().timer;
    expect(timer?.mode).toBe('rest');
    expect(timer?.totalSeconds).toBe(90);
    expect(timer?.endsAt).toBeGreaterThan(Date.now());

    // Persisted on every change, so a reload mid-rest resumes.
    const stored = await db.timer.get('current');
    expect(stored?.endsAt).toBe(timer?.endsAt);
  });

  it('starts nothing when the prescription has no rest', async () => {
    await useTimer.getState().startRest({ seconds: 0, contextLabel: 'Warm-up', exerciseId: 'x' });
    expect(useTimer.getState().timer).toBeUndefined();
    expect(await db.timer.get('current')).toBeUndefined();
  });
});

describe('adjust', () => {
  it('extends the running countdown', async () => {
    await start();
    const before = remainingMs(useTimer.getState().timer!, Date.now());
    await useTimer.getState().adjust(15);
    const after = remainingMs(useTimer.getState().timer!, Date.now());
    expect(after - before).toBeGreaterThan(14_000);
    expect(useTimer.getState().timer?.totalSeconds).toBe(105);
  });

  it('carries the override to the remaining sets of that exercise', async () => {
    await start();
    await useTimer.getState().adjust(15);
    expect(useTimer.getState().restSecondsFor('trap-bar-deadlift', 90)).toBe(105);
  });

  it('accumulates repeated presses', async () => {
    await start();
    await useTimer.getState().adjust(15);
    await useTimer.getState().adjust(15);
    expect(useTimer.getState().restSecondsFor('trap-bar-deadlift', 90)).toBe(120);
  });

  it('shortens rest too, and never below zero', async () => {
    await start();
    await useTimer.getState().adjust(-15);
    expect(useTimer.getState().restSecondsFor('trap-bar-deadlift', 90)).toBe(75);

    for (let i = 0; i < 10; i += 1) await useTimer.getState().adjust(-15);
    expect(useTimer.getState().restSecondsFor('trap-bar-deadlift', 90)).toBe(0);
  });

  it('leaves other exercises on their prescribed rest', async () => {
    await start();
    await useTimer.getState().adjust(15);
    expect(useTimer.getState().restSecondsFor('hip-thrust', 60)).toBe(60);
  });

  it('does not touch the programme', async () => {
    await start();
    await useTimer.getState().adjust(15);
    // The override lives in memory; nothing about the stored programme moves.
    expect(await db.programmes.count()).toBe(0);
  });
});

describe('restSecondsFor', () => {
  it('falls back to the prescribed rest with no override', () => {
    expect(useTimer.getState().restSecondsFor('anything', 120)).toBe(120);
  });
});

describe('skip', () => {
  it('clears the timer and its stored row', async () => {
    await start();
    await useTimer.getState().skip();
    expect(useTimer.getState().timer).toBeUndefined();
    expect(await db.timer.get('current')).toBeUndefined();
  });
});
