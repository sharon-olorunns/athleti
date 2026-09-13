import { useEffect, useState } from 'react';
import {
  formatCountdown,
  hasElapsed,
  isFinalCountdown,
  overdueLabel,
  overdueMs,
  progress,
  remainingSeconds,
} from '@/core/timer';
import { getMeta, META_KEYS, setMeta } from '@/db/db';
import {
  notificationPermission,
  requestNotificationPermission,
} from '@/platform/notifications';
import { useTimer } from '@/state/timerStore';
import styles from './TimerBar.module.css';

const MODE_LABEL = {
  rest: 'Rest',
  hold: 'Hold',
  interval: 'Interval',
} as const;

/**
 * The pinned bar: remaining time, context label and a skip, on every screen while
 * a timer runs. Tapping it opens the full-screen view.
 */
export function TimerBar({ now }: { now: number }) {
  const timer = useTimer((s) => s.timer);
  const skip = useTimer((s) => s.skip);
  const dismiss = useTimer((s) => s.dismiss);
  const setExpanded = useTimer((s) => s.setExpanded);
  const finishedWhileHidden = useTimer((s) => s.finishedWhileHidden);

  const [offerNotifications, setOfferNotifications] = useState(false);

  /**
   * The one moment notifications are worth asking about: a rest has just run out
   * while the app was in the background. Never on first launch, and never twice.
   */
  useEffect(() => {
    if (!finishedWhileHidden) return;
    if (notificationPermission() !== 'default') return;
    void getMeta<boolean>(META_KEYS.notificationOffered).then((already) => {
      if (already !== true) setOfferNotifications(true);
    });
  }, [finishedWhileHidden]);

  const closeOffer = () => {
    setOfferNotifications(false);
    void setMeta(META_KEYS.notificationOffered, true);
  };

  if (timer === undefined) return null;

  const elapsed = hasElapsed(timer, now);
  const seconds = remainingSeconds(timer, now);
  const urgent = isFinalCountdown(timer, now);

  return (
    <>
      {offerNotifications && (
        <div className={styles.offer}>
          <span className={styles.offerText}>Notify you when a rest ends?</span>
          <button type="button" className={styles.offerButton} onClick={closeOffer}>
            Not now
          </button>
          <button
            type="button"
            className={`${styles.offerButton} ${styles.offerPrimary}`}
            onClick={() => {
              void requestNotificationPermission().finally(closeOffer);
            }}
          >
            Enable
          </button>
        </div>
      )}

      <div className={styles.bar}>
        <div
          className={styles.progress}
          style={{ width: `${Math.round(progress(timer, now) * 100)}%` }}
        />

        <button type="button" className={styles.main} onClick={() => setExpanded(true)}>
          <span
            className={`${styles.time} ${elapsed ? styles.done : ''} ${
              urgent ? styles.urgent : ''
            }`}
          >
            {elapsed ? '✓' : formatCountdown(seconds)}
          </span>
          <span className={styles.labels}>
            <span className={styles.context}>{timer.contextLabel}</span>
            <span className={styles.mode}>
              {elapsed
                ? // Not a silent reset: say that it finished, and how long ago.
                  `${MODE_LABEL[timer.mode]} finished ${overdueLabel(overdueMs(timer, now))}`
                : timer.paused
                  ? `${MODE_LABEL[timer.mode]} · paused`
                  : timer.interval !== undefined
                    ? `${timer.interval.phase} · round ${timer.interval.round} of ${timer.interval.totalRounds}`
                    : MODE_LABEL[timer.mode]}
            </span>
          </span>
        </button>

        <button
          type="button"
          className={styles.skip}
          onClick={() => void (elapsed ? dismiss() : skip())}
        >
          {elapsed ? 'Clear' : 'Skip'}
        </button>
      </div>
    </>
  );
}
