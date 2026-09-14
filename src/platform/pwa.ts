/**
 * Service-worker registration and install detection.
 *
 * The registration is manual rather than injected, so the app controls when a
 * waiting worker takes over: `updateServiceWorker` is only called from the update
 * banner, and the banner itself is withheld during a workout.
 */
import { registerSW } from 'virtual:pwa-register';

export { isIOS } from './device';

type UpdateFn = (reload?: boolean) => Promise<void>;

let applyUpdate: UpdateFn | undefined;

export interface ServiceWorkerHandlers {
  onUpdateReady: () => void;
  onOfflineReady: () => void;
}

export function registerServiceWorker(handlers: ServiceWorkerHandlers): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh: handlers.onUpdateReady,
    onOfflineReady: handlers.onOfflineReady,
  });
}

/** Activate the waiting worker and reload. Only ever called from the banner. */
export async function applyServiceWorkerUpdate(): Promise<void> {
  await applyUpdate?.(true);
}

/** Launched from the home screen, without browser chrome. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

/**
 * The event Chromium fires when the app is installable. It has to be captured
 * and kept: it can only be used once, and only from a user gesture later.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | undefined;

export function captureInstallPrompt(onAvailable: () => void): () => void {
  const handler = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    onAvailable();
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== undefined;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (deferredPrompt === undefined) return 'unavailable';
  const event = deferredPrompt;
  // The event is single-use, whatever the outcome.
  deferredPrompt = undefined;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return 'dismissed';
  }
}
