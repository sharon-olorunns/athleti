import { describe, expect, it } from 'vitest';
import type { ProgrammeDay } from '@/types';
import { anExercise as exercise, aPrescription as prescription } from '@/test/factories';
import {
  exerciseIdsOf,
  logsPerSide,
  prescriptionText,
  prescriptionsOf,
  setRowCount,
  targetText,
  totalSetRows,
  tracks,
} from './prescription';

describe('logsPerSide', () => {
  it('is true for a unilateral exercise', () => {
    expect(logsPerSide(prescription(), exercise({ unilateral: true }))).toBe(true);
  });

  it('is true when the prescription says per side even if the exercise is not unilateral', () => {
    expect(logsPerSide(prescription({ perSide: true }), exercise({ unilateral: false }))).toBe(true);
  });

  it('is false for a plain bilateral set', () => {
    expect(logsPerSide(prescription(), exercise())).toBe(false);
  });

  it('falls back to the prescription when the exercise is missing', () => {
    expect(logsPerSide(prescription({ perSide: true }), undefined)).toBe(true);
    expect(logsPerSide(prescription(), undefined)).toBe(false);
  });
});

describe('setRowCount', () => {
  it('is one row per set bilaterally', () => {
    expect(setRowCount(prescription({ sets: 4 }), exercise())).toBe(4);
  });

  it('is two rows per set per side', () => {
    expect(setRowCount(prescription({ sets: 3, perSide: true }), exercise())).toBe(6);
  });
});

describe('targetText', () => {
  it('shows reps as written, range included', () => {
    expect(targetText(prescription({ reps: '6-8' }))).toBe('6-8');
    expect(targetText(prescription({ reps: '5' }))).toBe('5');
  });

  it('shows a hold in seconds', () => {
    expect(targetText(prescription({ holdSeconds: 45, timerMode: 'hold' }))).toBe('45s');
  });

  it('shows a distance in metres', () => {
    expect(targetText(prescription({ reps: undefined, distanceM: 20 }))).toBe('20 m');
  });

  it('shows interval work and rest', () => {
    const p = prescription({
      sets: 1,
      timerMode: 'interval',
      interval: { workSeconds: 20, restSeconds: 40, rounds: 8 },
    });
    expect(targetText(p)).toBe('20s on / 40s off');
  });

  it('prefers the hold over reps when both are present', () => {
    expect(targetText(prescription({ holdSeconds: 30, reps: '10' }))).toBe('30s');
  });

  it('is empty when there is nothing to show', () => {
    expect(targetText(prescription({ reps: undefined }))).toBe('');
  });
});

describe('prescriptionText', () => {
  it('reads as sets × target', () => {
    expect(prescriptionText(prescription({ sets: 4, reps: '5' }), exercise())).toBe('4 × 5');
  });

  it('says per side where sets are logged per side', () => {
    expect(
      prescriptionText(prescription({ sets: 3, reps: '8', perSide: true }), exercise()),
    ).toBe('3 × 8 per side');
  });

  it('counts interval rounds rather than sets', () => {
    const p = prescription({
      sets: 1,
      timerMode: 'interval',
      interval: { workSeconds: 20, restSeconds: 40, rounds: 8 },
    });
    expect(prescriptionText(p, exercise())).toBe('8 × 20s on / 40s off');
  });

  it('falls back to a set count when there is no target', () => {
    expect(prescriptionText(prescription({ sets: 2, reps: undefined }), exercise())).toBe(
      '2 sets',
    );
    expect(prescriptionText(prescription({ sets: 1, reps: undefined }), exercise())).toBe(
      '1 set',
    );
  });
});

describe('tracks', () => {
  it('reports the fields the exercise declares', () => {
    const seconds = exercise({ tracks: ['seconds'] });
    expect(tracks(seconds, 'seconds')).toBe(true);
    // A set row must not show a weight box for an exercise that carries no weight.
    expect(tracks(seconds, 'weight')).toBe(false);
  });

  it('tracks nothing for a missing exercise', () => {
    expect(tracks(undefined, 'weight')).toBe(false);
  });
});

describe('day flattening', () => {
  const day: ProgrammeDay = {
    id: 'day-1',
    dayLabel: 'Day 1 · Mon',
    title: 'Lower',
    cnsLoad: 'high',
    targetMinutes: 70,
    atHome: false,
    blocks: [
      {
        letter: 'A',
        name: 'Strength',
        estimatedMinutes: 20,
        items: [{ kind: 'single', prescription: prescription({ exerciseId: 'a', sets: 4 }) }],
      },
      {
        letter: 'B',
        name: 'Pairs',
        estimatedMinutes: 15,
        items: [
          {
            kind: 'superset',
            label: 'Superset',
            restBetweenPairsSeconds: 60,
            prescriptions: [
              prescription({ exerciseId: 'b', sets: 3 }),
              prescription({ exerciseId: 'a', sets: 3, perSide: true }),
            ],
          },
        ],
      },
    ],
  };

  it('flattens singles and supersets in order', () => {
    expect(prescriptionsOf(day).map((p) => p.exerciseId)).toEqual(['a', 'b', 'a']);
  });

  it('lists distinct exercise ids by first appearance', () => {
    expect(exerciseIdsOf(day)).toEqual(['a', 'b']);
  });

  it('totals set rows across blocks, doubling per-side sets', () => {
    // 4 + 3 + (3 × 2) = 13
    expect(totalSetRows(day, () => exercise())).toBe(13);
  });
});
