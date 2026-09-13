import {
  formatCountdown,
  hasElapsed,
  isFinalCountdown,
  overdueLabel,
  overdueMs,
  progress,
  remainingSeconds,
} from '@/core/timer';
import { useTimer } from '@/state/timerStore';
import styles from './TimerSheet.module.css';

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The full-screen timer: a large countdown, a circular progress ring and the
 * −15s / +15s / Pause / Skip controls. Reached by tapping the pinned bar.
 */
export function TimerSheet({ now }: { now: number }) {
  const timer = useTimer((s) => s.timer);
  const expanded = useTimer((s) => s.expanded);
  const setExpanded = useTimer((s) => s.setExpanded);
  const pause = useTimer((s) => s.pause);
  const resume = useTimer((s) => s.resume);
  const adjust = useTimer((s) => s.adjust);
  const skip = useTimer((s) => s.skip);
  const dismiss = useTimer((s) => s.dismiss);

  if (!expanded || timer === undefined) return null;

  const elapsed = hasElapsed(timer, now);
  const urgent = isFinalCountdown(timer, now);
  const isWorkPhase = timer.mode === 'hold' || timer.interval?.phase === 'work';
  const fraction = progress(timer, now);

  const ringClass = [
    styles.ringFill,
    elapsed ? styles.ringDone : urgent ? styles.ringUrgent : isWorkPhase ? styles.ringWork : '',
    urgent ? styles.pulse : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.sheet} role="dialog" aria-label="Timer">
      <button
        type="button"
        className={styles.close}
        onClick={() => setExpanded(false)}
        aria-label="Close timer"
      >
        ▾
      </button>

      <p className={styles.context}>{timer.contextLabel}</p>
      {timer.interval !== undefined && (
        <p className={styles.round}>
          {timer.interval.phase} · round {timer.interval.round} of {timer.interval.totalRounds}
        </p>
      )}

      <div className={styles.ringWrap}>
        <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
          <circle className={styles.ringTrack} cx="50" cy="50" r={RADIUS} strokeWidth="6" />
          <circle
            className={ringClass}
            cx="50"
            cy="50"
            r={RADIUS}
            strokeWidth="6"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * fraction}
          />
        </svg>

        <div className={styles.readout}>
          <span
            className={`${styles.count} ${elapsed ? styles.done : ''} ${urgent ? styles.urgent : ''}`}
          >
            {elapsed ? '0' : formatCountdown(remainingSeconds(timer, now))}
          </span>
          <span className={styles.caption}>
            {elapsed
              ? `finished ${overdueLabel(overdueMs(timer, now))}`
              : timer.paused
                ? 'paused'
                : timer.mode}
          </span>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={() => void adjust(-15)}
          disabled={elapsed}
        >
          −15s
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={() => void adjust(15)}
          disabled={elapsed}
        >
          +15s
        </button>

        {!elapsed && (
          <button
            type="button"
            className={`${styles.control} ${styles.wide} ${styles.primary}`}
            onClick={() => void (timer.paused ? resume() : pause())}
          >
            {timer.paused ? 'Resume' : 'Pause'}
          </button>
        )}

        <button
          type="button"
          className={`${styles.control} ${styles.wide} ${elapsed ? styles.primary : ''}`}
          onClick={() => {
            void (elapsed ? dismiss() : skip());
            setExpanded(false);
          }}
        >
          {elapsed ? 'Done' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
