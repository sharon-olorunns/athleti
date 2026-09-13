/**
 * Install and update decisions. Pure.
 *
 * The one rule worth encoding: a service-worker update is never offered during a
 * workout. A reload is safe — the session is persisted on every mutation — but
 * offering one mid-set is exactly the kind of interruption the app is supposed to
 * avoid, so the offer waits until the session is finished.
 */

export type InstallState = 'installed' | 'promptable' | 'ios-manual' | 'unavailable';

export interface InstallContext {
  /** Already launched from the home screen. */
  standalone: boolean;
  /** The browser fired beforeinstallprompt and it has not been used yet. */
  canPrompt: boolean;
  /** iOS Safari, which never fires beforeinstallprompt. */
  isIOS: boolean;
  /** The user dismissed the offer. */
  dismissed: boolean;
}

export function installState({
  standalone,
  canPrompt,
  isIOS,
  dismissed,
}: InstallContext): InstallState {
  if (standalone) return 'installed';
  if (dismissed) return 'unavailable';
  if (canPrompt) return 'promptable';
  // iOS has no install API at all; the only route is Share → Add to Home Screen.
  if (isIOS) return 'ios-manual';
  return 'unavailable';
}

export function shouldOfferUpdate(updateReady: boolean, workoutActive: boolean): boolean {
  return updateReady && !workoutActive;
}

/** iOS Safari, including iPadOS which reports itself as a Mac with touch. */
export function detectIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/u.test(userAgent)) return true;
  return /Macintosh/u.test(userAgent) && maxTouchPoints > 1;
}
