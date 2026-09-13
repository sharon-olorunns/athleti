/**
 * Screen wake lock, held while a workout is active.
 *
 * The lock is dropped by the browser whenever the page is hidden, so it has to
 * be re-requested on the way back — otherwise the screen starts sleeping again
 * after the first time the user pockets the phone.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

let sentinel: WakeLockSentinelLike | undefined;

function wakeLock(): WakeLockLike | undefined {
  return (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
}

export function wakeLockSupported(): boolean {
  return wakeLock() !== undefined;
}

export async function requestWakeLock(): Promise<void> {
  const api = wakeLock();
  if (api === undefined) return;
  if (sentinel !== undefined && !sentinel.released) return;

  try {
    sentinel = await api.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = undefined;
    });
  } catch {
    // Denied, or the tab was already hidden. Not worth surfacing.
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    // ignore
  }
  sentinel = undefined;
}
