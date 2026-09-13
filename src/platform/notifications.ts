/**
 * Timer notifications — a supplementary alert for when the app is in the
 * background, never the primary one.
 *
 * Permission is not requested on first launch. It is offered once, after a rest
 * has actually elapsed while the app was backgrounded, which is the first moment
 * it means anything to the user. Browsers require a user gesture to prompt, so
 * the offer is an inline banner with a button rather than an automatic call.
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Post a notification if permission is already granted. Android Chrome refuses
 * the `Notification` constructor and wants a service worker registration, which
 * arrives with the PWA shell — until then this degrades to nothing rather than
 * throwing into a workout.
 */
export function postTimerNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'trainer-timer', silent: false });
  } catch {
    // ignore
  }
}
