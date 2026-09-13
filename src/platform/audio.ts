/**
 * The timer alert.
 *
 * iOS Safari will not play audio from an `AudioContext` created outside a user
 * gesture, so the context is created and unlocked when the workout starts — at
 * the tap on Start — rather than when the first timer fires. By then it is too
 * late and the alert is silent.
 *
 * The sound is synthesised rather than loaded: the app must work offline from
 * first load, and an oscillator needs no asset, no fetch and no decode.
 */

type Ctor = typeof AudioContext;

let context: AudioContext | undefined;
let unlocked = false;

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

/** Release the context when the workout ends, so the tab is not holding audio open. */
export function releaseAudio(): void {
  try {
    void context?.close();
  } catch {
    // ignore
  }
  context = undefined;
  unlocked = false;
}

function beep(startOffset: number, frequency: number, durationSeconds: number): void {
  if (context === undefined) return;
  const at = context.currentTime + startOffset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  // A short attack and decay rather than a square edge, which clicks.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.35, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSeconds);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + durationSeconds + 0.02);
}

export type AlertKind = 'finished' | 'work' | 'rest';

/**
 * Distinct patterns, because the three mean different things across the gym
 * floor: a rest ending, a work period starting, a work period ending.
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
      // Rest over, back to work: three even beeps, hard to miss.
      beep(0, 880, 0.12);
      beep(0.18, 880, 0.12);
      beep(0.36, 1046, 0.24);
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
