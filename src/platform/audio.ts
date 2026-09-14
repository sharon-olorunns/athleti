/**
 * The timer alert.
 *
 * iOS is the constraint this file is written around (section 6). Safari will not
 * play audio from an `AudioContext` created outside a user gesture, so the
 * context is created and unlocked when the workout starts — at the tap on Start —
 * rather than when the first timer fires; by then the gesture is long gone. Safari
 * also suspends the context whenever the tab is backgrounded, so it is resumed on
 * every return to the foreground.
 *
 * The sound is synthesised rather than loaded: the app must work offline from
 * first load, and an oscillator needs no asset, no fetch and no decode.
 */

type Ctor = typeof AudioContext;

let context: AudioContext | undefined;
let unlocked = false;
let keepAlive: HTMLAudioElement | undefined;

function audioContextCtor(): Ctor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * Call from a real user gesture — the tap that starts the workout. Safe to call
 * more than once.
 */
export function primeAudio(): void {
  const Ctor = audioContextCtor();
  if (Ctor === undefined) return;

  try {
    context ??= new Ctor();
    void context.resume();

    if (!unlocked) {
      // A silent blip completes the unlock on iOS, where merely resuming is not
      // always enough.
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.01);
      unlocked = true;
    }
  } catch {
    // Audio is a supplementary alert; never let it break a workout.
  }
}

/**
 * Resume the context after the tab has been in the background.
 *
 * iOS suspends a backgrounded context, and a suspended context plays nothing —
 * so without this, the alert is silent for the rest of the session the first time
 * the phone goes in a pocket.
 */
export function resumeAudio(): void {
  try {
    if (context !== undefined && context.state !== 'running') void context.resume();
    if (keepAlive !== undefined && keepAlive.paused) void keepAlive.play().catch(() => undefined);
  } catch {
    // ignore
  }
}

/** Release the context when the workout ends, so the tab is not holding audio open. */
export function releaseAudio(): void {
  stopKeepAlive();
  try {
    void context?.close();
  } catch {
    // ignore
  }
  context = undefined;
  unlocked = false;
}

/**
 * A short silent WAV, built rather than shipped so it costs no asset and no
 * fetch. 8-bit unsigned PCM is silent at 0x80, and a tenth of a second is plenty
 * to loop.
 */
function silentWavUrl(): string {
  const rate = 8000;
  const samples = rate / 10;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(0x80);

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

/**
 * The silent-audio keep-alive (section 6, point 5).
 *
 * A looping silent element keeps the audio session alive while Safari is
 * backgrounded with the screen still on, which is enough for the alert to fire.
 * It does not survive a locked screen and it costs battery, which is why it is a
 * setting rather than the default.
 */
export function startKeepAlive(): void {
  if (typeof Audio === 'undefined' || keepAlive !== undefined) return;
  try {
    const element = new Audio(silentWavUrl());
    element.loop = true;
    element.volume = 0.01;
    // Without this, iOS treats it as a media item and hands it the lock screen.
    element.setAttribute('playsinline', '');
    void element.play().catch(() => undefined);
    keepAlive = element;
  } catch {
    // ignore
  }
}

export function stopKeepAlive(): void {
  try {
    keepAlive?.pause();
    if (keepAlive !== undefined) URL.revokeObjectURL(keepAlive.src);
  } catch {
    // ignore
  }
  keepAlive = undefined;
}

/** 0–1, applied to every alert. A gym is loud, so full is the default. */
let volume = 1;

export function setAlertVolume(next: number): void {
  volume = Math.min(Math.max(next, 0), 1);
}

function beep(startOffset: number, frequency: number, durationSeconds: number): void {
  if (context === undefined || volume <= 0) return;
  const at = context.currentTime + startOffset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  // A short attack and decay rather than a square edge, which clicks.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.35 * volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSeconds);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + durationSeconds + 0.02);
}

export type AlertKind = 'finished' | 'work' | 'rest';

/** How long the 'finished' alert runs, so the visual flash can match it. */
export const FINISHED_ALERT_MS = 2000;

/**
 * Distinct patterns, because the three mean different things across the gym
 * floor: a rest ending, a work period starting, a work period ending.
 *
 * 'finished' is the one that has to cut through a gym with headphones in and a
 * phone face-down on a bench, so it is a two-tone figure repeated three times over
 * about two seconds rather than a single beep (section 6, point 3).
 */
export function playAlert(kind: AlertKind): void {
  if (context === undefined) return;
  try {
    void context.resume();
    if (kind === 'work') {
      // Going: two rising notes.
      beep(0, 880, 0.12);
      beep(0.14, 1318, 0.18);
    } else if (kind === 'rest') {
      // Stopping: one falling note.
      beep(0, 660, 0.22);
    } else {
      for (let repeat = 0; repeat < 3; repeat += 1) {
        const at = repeat * 0.66;
        beep(at, 880, 0.16);
        beep(at + 0.2, 1318, 0.26);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Android vibrates; iOS Safari does not support this at all, which is why the
 * alert is never vibration alone.
 */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}
