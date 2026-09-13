import { describe, expect, it } from 'vitest';
import seedJson from '@/data/seed-programme.json';
import type { Exercise, SeedFile, WorkoutSession } from '@/types';
import { aSession, aSet } from '@/test/factories';
import {
  customExerciseId,
  deriveExerciseFromAlternative,
  effectiveExerciseId,
  permanentSubstitutionCandidate,
  preferKneeSafe,
  resolveAlternatives,
  searchLibrary,
  sortAlternatives,
  substitutionFor,
  substitutionKey,
  substitutionTallies,
} from './alternatives';

const seed = seedJson as unknown as SeedFile;
const library = new Map(seed.exercises.map((e) => [e.id, e]));
const seeded = (id: string): Exercise => {
  const found = library.get(id);
  if (found === undefined) throw new Error(`no seeded exercise ${id}`);
  return found;
};

describe('resolveAlternatives', () => {
  it('attaches the library exercise where the seed names one', () => {
    const alternatives = resolveAlternatives(seeded('split-squat-box'), library);
    const byId = alternatives.find((a) => a.exercise?.id === 'single-leg-press-partial');
    expect(byId?.reason).toContain('machine supports the back');
  });

  it('keeps free-text alternatives, which most of the seed is', () => {
    const alternatives = resolveAlternatives(seeded('split-squat-box'), library);
    const freeText = alternatives.find((a) => a.name === 'Reverse lunge to a box');
    expect(freeText).toBeDefined();
    expect(freeText?.exercise).toBeUndefined();
  });

  it('gives every alternative a distinct key', () => {
    for (const exercise of seed.exercises) {
      const keys = resolveAlternatives(exercise, library).map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('is empty for an unknown exercise', () => {
    expect(resolveAlternatives(undefined, library)).toEqual([]);
  });
});

describe('preferKneeSafe', () => {
  it('is true for a knee-sensitive exercise', () => {
    expect(preferKneeSafe(seeded('split-squat-box'), undefined)).toBe(true);
  });

  it('is true once the last recorded pain score reached 4', () => {
    const sled = seeded('heavy-sled-push');
    expect(sled.kneeSensitive).toBe(false);
    expect(preferKneeSafe(sled, 4)).toBe(true);
    expect(preferKneeSafe(sled, 7)).toBe(true);
  });

  it('is false for a knee-neutral exercise with a quiet knee', () => {
    expect(preferKneeSafe(seeded('heavy-sled-push'), 3)).toBe(false);
    expect(preferKneeSafe(seeded('heavy-sled-push'), undefined)).toBe(false);
  });
});

describe('sortAlternatives', () => {
  const alternatives = [
    { key: 'a', name: 'A', reason: '', kneeSafe: false },
    { key: 'b', name: 'B', reason: '', kneeSafe: true },
    { key: 'c', name: 'C', reason: '', kneeSafe: false },
    { key: 'd', name: 'D', reason: '', kneeSafe: true },
  ];

  it('puts knee-safe options first when asked', () => {
    expect(sortAlternatives(alternatives, true).map((a) => a.key)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps the seeded order otherwise', () => {
    expect(sortAlternatives(alternatives, false).map((a) => a.key)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not mutate the input', () => {
    const copy = [...alternatives];
    sortAlternatives(alternatives, true);
    expect(alternatives).toEqual(copy);
  });
});

describe('searchLibrary', () => {
  it('finds by name', () => {
    const results = searchLibrary('hip thrust', library);
    expect(results[0]?.id).toBe('hip-thrust');
  });

  it('finds by muscle and by equipment', () => {
    expect(searchLibrary('glute', library).length).toBeGreaterThan(0);
    expect(searchLibrary('sled', library).length).toBeGreaterThan(0);
  });

  it('ranks name matches above muscle matches', () => {
    const results = searchLibrary('sled', library);
    expect(results[0]?.name.toLowerCase()).toContain('sled');
  });

  it('excludes ids the caller is already showing', () => {
    const results = searchLibrary('hip thrust', library, ['hip-thrust']);
    expect(results.some((e) => e.id === 'hip-thrust')).toBe(false);
  });

  it('is empty for an empty query', () => {
    expect(searchLibrary('   ', library)).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(searchLibrary('NORDIC', library).length).toBeGreaterThan(0);
  });
});

describe('customExerciseId', () => {
  it('is stable, kebab-case and namespaced', () => {
    expect(customExerciseId('Reverse lunge to a box')).toBe('custom-reverse-lunge-to-a-box');
    expect(customExerciseId('Reverse lunge to a box')).toBe(customExerciseId('reverse LUNGE to a box'));
  });

  it('strips punctuation and collapses separators', () => {
    expect(customExerciseId('Split squat, flat-footed!')).toBe('custom-split-squat-flat-footed');
  });

  it('never collides with a seeded id', () => {
    for (const exercise of seed.exercises) {
      expect(customExerciseId(exercise.name)).not.toBe(exercise.id);
    }
  });
});

describe('deriveExerciseFromAlternative', () => {
  const source = seeded('split-squat-box');
  const derived = deriveExerciseFromAlternative(
    { name: 'Reverse lunge to a box', kneeSafe: true },
    source,
  );

  it('preserves the progression rule of the exercise it stands in for', () => {
    // Section 8: alternatives preserve the progression type where possible.
    expect(derived.progression).toEqual(source.progression);
  });

  it('preserves the tracked fields, so the set row shows the same inputs', () => {
    expect(derived.tracks).toEqual(source.tracks);
    expect(derived.unilateral).toBe(source.unilateral);
  });

  it('keeps pain tracking when the slot is pain-tracked', () => {
    expect(source.painTracked).toBe(true);
    expect(derived.painTracked).toBe(true);
  });

  it('takes knee sensitivity from the alternative rather than the source', () => {
    expect(derived.kneeSensitive).toBe(false);
    expect(
      deriveExerciseFromAlternative({ name: 'Heavy walking lunges', kneeSafe: false }, source)
        .kneeSensitive,
    ).toBe(true);
  });

  it('is never phase-1 excluded', () => {
    expect(derived.phase1Excluded).toBe(false);
  });

  it('does not copy the source alternatives onto the substitute', () => {
    expect(derived.alternatives).toEqual([]);
  });
});

describe('substitutionFor and effectiveExerciseId', () => {
  const session: WorkoutSession = aSession({
    entries: [
      { exerciseId: 'single-leg-press-partial', substitutedForId: 'split-squat-box', sets: [] },
    ],
  });

  it('finds what is standing in for a prescribed slot', () => {
    expect(substitutionFor(session, 'split-squat-box')?.exerciseId).toBe('single-leg-press-partial');
  });

  it('reports the performed exercise for a swapped slot', () => {
    expect(effectiveExerciseId(session, 'split-squat-box')).toBe('single-leg-press-partial');
  });

  it('reports the prescribed exercise for an untouched slot', () => {
    expect(effectiveExerciseId(session, 'hip-thrust')).toBe('hip-thrust');
    expect(effectiveExerciseId(undefined, 'hip-thrust')).toBe('hip-thrust');
  });
});

describe('substitutionTallies', () => {
  const swapped = (id: string, prescribed: string, performed: string): WorkoutSession =>
    aSession({
      id,
      entries: [
        {
          exerciseId: performed,
          substitutedForId: prescribed,
          sets: [aSet({ setIndex: 0, reps: 8 })],
        },
      ],
    });

  it('counts each substitution pair', () => {
    const tallies = substitutionTallies([
      swapped('a', 'split-squat-box', 'db-step-up-low'),
      swapped('b', 'split-squat-box', 'db-step-up-low'),
      swapped('c', 'split-squat-box', 'single-leg-press-partial'),
    ]);
    expect(tallies[0]).toEqual({
      prescribedId: 'split-squat-box',
      performedId: 'db-step-up-low',
      count: 2,
    });
    expect(tallies).toHaveLength(2);
  });

  it('ignores entries that were never substituted', () => {
    const plain = aSession({ entries: [{ exerciseId: 'hip-thrust', sets: [] }] });
    expect(substitutionTallies([plain])).toEqual([]);
  });
});

describe('permanentSubstitutionCandidate', () => {
  const sessions = Array.from({ length: 3 }, (_, i) =>
    aSession({
      id: `s${i}`,
      entries: [
        {
          exerciseId: 'db-step-up-low',
          substitutedForId: 'split-squat-box',
          sets: [aSet({ setIndex: 0, reps: 8 })],
        },
      ],
    }),
  );

  it('offers after three uses of the same substitute', () => {
    const candidate = permanentSubstitutionCandidate(sessions);
    expect(candidate).toEqual({
      prescribedId: 'split-squat-box',
      performedId: 'db-step-up-low',
      count: 3,
    });
  });

  it('does not offer before three', () => {
    expect(permanentSubstitutionCandidate(sessions.slice(0, 2))).toBeUndefined();
  });

  it('does not offer again once dismissed', () => {
    const dismissed = [substitutionKey('split-squat-box', 'db-step-up-low')];
    expect(permanentSubstitutionCandidate(sessions, dismissed)).toBeUndefined();
  });
});
