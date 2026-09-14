import { useEffect, useState } from 'react';
import { FINISHED_ALERT_MS } from '@/platform/audio';
import { useTimer } from '@/state/timerStore';
import styles from './AlertFlash.module.css';

/**
 * The visual half of the rest-is-over alert (section 6, point 3).
 *
 * A single beep is easy to miss in a gym — headphones in, phone face-down on a
 * bench, plates landing two racks over. The sound is loud and repeated; this is
 * the other half, a full-screen pulse that runs alongside it so the alert is
 * caught by whichever sense happens to be free.
 *
 * It never takes a tap: `pointer-events: none` means the Start, the set rows and
 * the timer bar all stay live underneath while it plays.
 */
export function AlertFlash() {
  const alertedAt = useTimer((s) => s.alertedAt);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (alertedAt === undefined) {
      setShowing(false);
      return;
    }
    setShowing(true);
    const id = window.setTimeout(() => setShowing(false), FINISHED_ALERT_MS);
    return () => window.clearTimeout(id);
  }, [alertedAt]);

  if (!showing || alertedAt === undefined) return null;

  // Keyed on the timestamp so a second alert restarts the animation rather than
  // landing on an element already mid-way through it.
  return <div key={alertedAt} className={styles.flash} aria-hidden="true" />;
}
