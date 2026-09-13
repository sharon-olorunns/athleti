import { describe, expect, it } from 'vitest';
import { detectIOS, installState, shouldOfferUpdate } from './pwa';

const context = (over: Partial<Parameters<typeof installState>[0]> = {}) => ({
  standalone: false,
  canPrompt: false,
  isIOS: false,
  dismissed: false,
  ...over,
});

describe('installState', () => {
  it('says nothing once launched from the home screen', () => {
    expect(installState(context({ standalone: true, canPrompt: true }))).toBe('installed');
  });

  it('offers the native prompt where the browser supports it', () => {
    expect(installState(context({ canPrompt: true }))).toBe('promptable');
  });

  it('falls back to instructions on iOS, which has no install API', () => {
    expect(installState(context({ isIOS: true }))).toBe('ios-manual');
  });

  it('prefers the native prompt over instructions when both apply', () => {
    expect(installState(context({ canPrompt: true, isIOS: true }))).toBe('promptable');
  });

  it('stays quiet once dismissed', () => {
    expect(installState(context({ canPrompt: true, dismissed: true }))).toBe('unavailable');
    expect(installState(context({ isIOS: true, dismissed: true }))).toBe('unavailable');
  });

  it('stays quiet where installing is not possible', () => {
    expect(installState(context())).toBe('unavailable');
  });
});

describe('shouldOfferUpdate', () => {
  /** A reload is safe, but offering one mid-set is the interruption to avoid. */
  it('holds the offer back during a workout', () => {
    expect(shouldOfferUpdate(true, true)).toBe(false);
  });

  it('offers once the session is over', () => {
    expect(shouldOfferUpdate(true, false)).toBe(true);
  });

  it('offers nothing when there is no update', () => {
    expect(shouldOfferUpdate(false, false)).toBe(false);
  });
});

describe('detectIOS', () => {
  it('recognises iPhone and iPad', () => {
    expect(detectIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
    expect(detectIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5)).toBe(true);
  });

  it('recognises iPadOS, which reports itself as a Mac with touch', () => {
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('does not mistake a desktop Mac for iOS', () => {
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
  });

  it('does not mistake Android for iOS', () => {
    expect(detectIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(false);
  });
});
