/**
 * Timer notifications — a supplementary alert for when the app is in the
 * background, never the primary one, and **never on iOS**.
 *
 * Section 6, point 6: Web Push on iOS needs the app installed to the home screen
 * and a push *server*, which this app does not have, and there is no way to
 * schedule a future local notification from a web app there. A notification path
 * on iOS would be a promise the app cannot keep, so it is not built. Android,
 * where the Notification API works from a service worker, gets it as a
 * supplementary alert.
 *
 * Permission is not requested on first launch. It is offered once, after a rest
 * has actually elapsed while the app was backgrounded, which is the first moment
 * it means anything to the user. Browsers require a user gesture to prompt, so
 * the offer is an inline banner with a button rather than an automatic call.
 */
import { isIOS } from './device';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): NotificationPermissionState {
  if (isIOS() || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (isIOS() || typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Post a notification if permission is already granted.
 *
 * The service worker is tried first: Android Chrome refuses the `Notification`
 * constructor outright and only accepts `ServiceWorkerRegistration.showNotification`.
 * The constructor remains as the fallback for desktop browsers, and anything that
 * refuses both degrades to nothing rather than throwing into a workout.
 */
export function postTimerNotification(title: string, body: string): void {
  if (isIOS() || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const options: NotificationOptions = { body, tag: 'trainer-timer', icon: 'icons/icon-192.png' };

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.ready
      .then((registration) => registration.showNotification(title, options))
      .catch(() => fallbackNotification(title, options));
    return;
  }

  fallbackNotification(title, options);
}

function fallbackNotification(title: string, options: NotificationOptions): void {
  try {
    new Notification(title, options);
  } catch {
    // Not supported here; the sound and vibration already carried the alert.
  }
}
