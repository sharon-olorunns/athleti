/**
 * Display strings and colours shared across screens. Kept out of components so the
 * same progression currency reads identically everywhere it appears.
 */
import type { CnsLoad, Equipment, ProgressionType } from '@/types';

export const PROGRESSION_TINT: Record<ProgressionType, string> = {
  load: 'var(--load)',
  quality: 'var(--quality)',
  time: 'var(--time)',
  fixed: 'var(--fixed)',
};

/** What the currency is, in the user's terms rather than the type name. */
export const PROGRESSION_MEANING: Record<ProgressionType, string> = {
  load: 'Progress by adding weight',
  quality: 'Never add weight — quality is the progression',
  time: 'Progress by time or lever, not weight',
  fixed: 'Fixed — this one does not progress',
};

export const CNS_TINT: Record<CnsLoad, string> = {
  high: 'var(--cns-high)',
  moderate: 'var(--cns-moderate)',
  low: 'var(--cns-low)',
};

export const CNS_LABEL: Record<CnsLoad, string> = {
  high: 'High CNS',
  moderate: 'Moderate CNS',
  low: 'Low CNS',
};

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  'trap-bar': 'Trap bar',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  cable: 'Cable',
  machine: 'Machine',
  smith: 'Smith',
  landmine: 'Landmine',
  sled: 'Sled',
  band: 'Band',
  bodyweight: 'Bodyweight',
  'med-ball': 'Med ball',
  plate: 'Plate',
  erg: 'Erg',
  box: 'Box',
};

export function equipmentLabel(equipment: Equipment): string {
  return EQUIPMENT_LABEL[equipment] ?? equipment;
}

/** "1h 10m" / "58 min" — target durations read at a glance. */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "90s" / "2:00" — a rest duration on its own. */
export function restLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}:00` : `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** The same duration as a phrase: "rest 90s", or just "no rest" when there is none. */
export function restPhrase(seconds: number): string {
  return seconds <= 0 ? 'no rest' : `rest ${restLabel(seconds)}`;
}
