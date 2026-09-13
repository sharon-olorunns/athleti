import { useEffect } from 'react';
import { releaseWakeLock, requestWakeLock } from '@/platform/wakeLock';

/**
 * Hold a screen wake lock while a workout is active.
 *
 * The browser drops the lock whenever the page is hidden, so it is re-requested
 * on the way back — without that, the screen starts sleeping again the first time
 * the phone goes in a pocket.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();

    const onVisibility = () => {
      if (!document.hidden) void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void releaseWakeLock();
    };
  }, [active]);
}
