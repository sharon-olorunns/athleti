/**
 * What device this is running on.
 *
 * Its own module rather than a corner of `pwa.ts`: that file imports the
 * service-worker registration, and anything reaching for a device check would
 * drag the whole Workbox virtual module in with it.
 */
import { detectIOS } from '@/core/pwa';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return detectIOS(navigator.userAgent, navigator.maxTouchPoints);
}
