import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { installState, shouldOfferUpdate } from '@/core/pwa';
import { getMeta, META_KEYS, setMeta } from '@/db/db';
import {
  applyServiceWorkerUpdate,
  canPromptInstall,
  captureInstallPrompt,
  isIOS,
  isStandalone,
  promptInstall,
  registerServiceWorker,
} from '@/platform/pwa';
import { useWorkout } from '@/state/workoutStore';
import styles from './PwaBanners.module.css';

/**
 * The install offer and the update offer.
 *
 * Registration lives here so there is one place that knows about the service
 * worker. An update is never applied on its own: the waiting worker only takes
 * over when the user taps Update, and the offer is withheld entirely while a
 * workout is in progress.
 */
export function PwaBanners() {
  const workoutActive = useWorkout((s) => s.session !== undefined);
  const bannerRef = useRef<HTMLDivElement>(null);

  const [updateReady, setUpdateReady] = useState(false);
  const [promptable, setPromptable] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(true);

  useEffect(() => {
    registerServiceWorker({
      onUpdateReady: () => setUpdateReady(true),
      onOfflineReady: () => undefined,
    });
    setPromptable(canPromptInstall());
    return captureInstallPrompt(() => setPromptable(true));
  }, []);

  // The install offer is made once and remembered, so it never becomes a nag.
  useEffect(() => {
    void getMeta<boolean>(META_KEYS.installOffered).then((already) =>
      setInstallDismissed(already === true),
    );
  }, []);

  const dismissInstall = () => {
    setInstallDismissed(true);
    void setMeta(META_KEYS.installOffered, true);
  };

  /*
   * Publish the banner's height so the Start and Finish bars stack above it
   * rather than underneath. Measured rather than assumed, because the copy wraps
   * differently across widths.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const node = bannerRef.current;
    if (node === null) {
      root.style.setProperty('--banner-offset', '0px');
      return;
    }
    const publish = () => root.style.setProperty('--banner-offset', `${node.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.setProperty('--banner-offset', '0px');
    };
  });

  const install = installState({
    standalone: isStandalone(),
    canPrompt: promptable,
    isIOS: isIOS(),
    dismissed: installDismissed,
  });

  if (shouldOfferUpdate(updateReady, workoutActive)) {
    return (
      <div className={styles.banner} ref={bannerRef}>
        <span className={styles.text}>
          <span className={styles.strong}>Update ready</span>
          Reloads the app. Nothing logged is lost.
        </span>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => void applyServiceWorkerUpdate()}
        >
          Update
        </button>
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Dismiss update"
          onClick={() => setUpdateReady(false)}
        >
          ×
        </button>
      </div>
    );
  }

  // Installing is a Today-screen concern, not something to raise mid-workout.
  if (workoutActive || install === 'installed' || install === 'unavailable') return null;

  return (
    <div className={styles.banner} ref={bannerRef}>
      <span className={styles.text}>
        <span className={styles.strong}>Add to your home screen</span>
        {install === 'ios-manual'
          ? 'Share → Add to Home Screen. Then it works with no signal.'
          : 'Launches without browser chrome and works offline.'}
      </span>
      {install === 'promptable' && (
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => {
            void promptInstall().then((outcome) => {
              setPromptable(false);
              if (outcome !== 'dismissed') dismissInstall();
            });
          }}
        >
          Install
        </button>
      )}
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss install prompt"
        onClick={dismissInstall}
      >
        ×
      </button>
    </div>
  );
}
