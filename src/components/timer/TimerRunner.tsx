import { useEffect, useRef, useState } from 'react';
import { hasElapsed } from '@/core/timer';
import { useApp } from '@/state/store';
import { useTimer } from '@/state/timerStore';
import { useWorkout } from '@/state/workoutStore';
import { TimerBar } from './TimerBar';
import { TimerSheet } from './TimerSheet';

/**
 * Drives the timer.
 *
 * The interval here exists only to re-render; it never accumulates elapsed time.
 * Every displayed number comes from `Date.now()` against the stored `endsAt`, so
 * a throttled or suspended tab cannot desynchronise the clock — it only makes the
 * display stale until the next tick or the next visibility change.
 */
export function TimerRunner() {
  const timer = useTimer((s) => s.timer);
  const handleElapsed = useTimer((s) => s.handleElapsed);
  const startRest = useTimer((s) => s.startRest);
  const restSecondsFor = useTimer((s) => s.restSecondsFor);

  const session = useWorkout((s) => s.session);
  const completeRow = useWorkout((s) => s.completeRow);
  const exerciseById = useApp((s) => s.exercise);

  const [now, setNow] = useState(() => Date.now());
  const wasHidden = useRef(false);

  const running = timer !== undefined;

  // Fixed bars on every screen stack above the timer bar while it is running.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--timer-offset',
      running ? 'var(--timerbar-h)' : '0px',
    );
    return () => document.documentElement.style.setProperty('--timer-offset', '0px');
  }, [running]);

  // A tick only asks React to re-read the clock.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  // Coming back from hidden: recompute at once rather than waiting for a tick,
  // so a timer that ran out in the background is reported immediately.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        wasHidden.current = true;
      } else {
        setNow(Date.now());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (timer === undefined || !hasElapsed(timer, now)) return;

    const hidden = wasHidden.current || document.hidden;
    const outcome = handleElapsed(Date.now(), hidden);
    wasHidden.current = false;

    if (outcome.kind !== 'hold-finished' && outcome.kind !== 'interval-finished') return;

    const target = outcome.target;
    if (target === undefined || session === undefined) return;

    // A hold or interval that reaches zero logs its own set, then rolls into the
    // rest, so the user never has to touch the phone mid-effort.
    void completeRow(
      target.exerciseId,
      { key: target.rowKey, setIndex: target.setIndex, label: '', ...(target.side ? { side: target.side } : {}) },
      target.values,
      true,
    ).then(() => {
      if (target.restSeconds > 0) {
        void startRest({
          seconds: restSecondsFor(target.exerciseId, target.restSeconds),
          contextLabel: target.restContextLabel,
          exerciseId: target.exerciseId,
        });
      }
    });
  }, [timer, now, handleElapsed, completeRow, session, startRest, restSecondsFor, exerciseById]);

  if (timer === undefined) return null;

  return (
    <>
      <TimerBar now={now} />
      <TimerSheet now={now} />
    </>
  );
}
