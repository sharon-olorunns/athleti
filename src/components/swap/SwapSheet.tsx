import { useMemo, useState } from 'react';
import type { Exercise } from '@/types';
import {
  deriveExerciseFromAlternative,
  preferKneeSafe,
  resolveAlternatives,
  searchLibrary,
  sortAlternatives,
} from '@/core/alternatives';
import { Chip } from '@/components/Chip';
import { PROGRESSION_TINT } from '@/components/labels';
import styles from './SwapSheet.module.css';

interface Props {
  /** What the programme prescribes for this slot. */
  prescribed: Exercise | undefined;
  /** What is currently being performed, if already swapped. */
  currentId: string;
  library: ReadonlyMap<string, Exercise>;
  lastPainScore: number | undefined;
  /** True when opened straight from a red pain score. */
  fromPainScore?: boolean;
  onChoose: (exercise: Exercise, reason: string) => void;
  onRevert: () => void;
  onClose: () => void;
}

/**
 * Section 8: a substitute in two taps, without leaving the workout.
 *
 * Knee-safe options are listed first when the exercise loads the front of the
 * knee or the knee has been complaining, and a search over the whole library
 * covers substitutes the curated list does not name.
 */
export function SwapSheet({
  prescribed,
  currentId,
  library,
  lastPainScore,
  fromPainScore = false,
  onChoose,
  onRevert,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');

  const kneeFirst = preferKneeSafe(prescribed, lastPainScore);
  const alternatives = useMemo(
    () => sortAlternatives(resolveAlternatives(prescribed, library), kneeFirst),
    [prescribed, library, kneeFirst],
  );

  const results = useMemo(
    () =>
      searchLibrary(query, library, [
        currentId,
        ...alternatives.map((a) => a.exercise?.id).filter((id): id is string => id !== undefined),
      ]),
    [query, library, currentId, alternatives],
  );

  const swapped = prescribed !== undefined && currentId !== prescribed.id;

  return (
    <>
      <div className={styles.scrim} role="presentation" onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-label="Swap exercise">
        <div className={styles.head}>
          <h2 className={styles.title}>Swap {prescribed?.name ?? 'exercise'}</h2>
          <p className={styles.subtitle}>For this session only. The programme is unchanged.</p>
          {kneeFirst && (
            <p className={styles.kneeNote}>
              {fromPainScore
                ? 'Knee-safe options first, after that score.'
                : 'Knee-safe options listed first.'}
            </p>
          )}
          <input
            className={styles.search}
            type="search"
            inputMode="search"
            placeholder="Search the whole library…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            aria-label="Search exercises"
          />
        </div>

        <div className={styles.list}>
          {query.trim() === '' ? (
            <>
              <p className={styles.sectionLabel}>Alternatives</p>
              {alternatives.length === 0 && (
                <p className={styles.empty}>
                  No alternatives listed for this one. Search the library above.
                </p>
              )}
              {alternatives.map((alternative) => (
                <button
                  key={alternative.key}
                  type="button"
                  className={styles.option}
                  onClick={() =>
                    onChoose(
                      alternative.exercise ??
                        // Not in the library yet: derive one so what was done is
                        // logged under an id of its own and builds history.
                        deriveExerciseFromAlternative(alternative, prescribed!),
                      alternative.reason,
                    )
                  }
                  disabled={prescribed === undefined}
                >
                  <span className={styles.optionHead}>
                    <span className={styles.name}>{alternative.name}</span>
                    {alternative.kneeSafe && (
                      <Chip variant="tinted" tint="var(--pain-green)">
                        knee-safe
                      </Chip>
                    )}
                  </span>
                  <span className={styles.reason}>{alternative.reason}</span>
                  {alternative.exercise !== undefined && (
                    <span className={styles.meta}>
                      <Chip
                        variant="tinted"
                        tint={PROGRESSION_TINT[alternative.exercise.progression.type]}
                      >
                        {alternative.exercise.progression.label}
                      </Chip>
                    </span>
                  )}
                </button>
              ))}
            </>
          ) : (
            <>
              <p className={styles.sectionLabel}>Library</p>
              {results.length === 0 && <p className={styles.empty}>Nothing matches “{query}”.</p>}
              {results.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className={styles.option}
                  onClick={() => onChoose(exercise, 'chosen from the library')}
                >
                  <span className={styles.optionHead}>
                    <span className={styles.name}>{exercise.name}</span>
                    {!exercise.kneeSensitive && (
                      <Chip variant="tinted" tint="var(--pain-green)">
                        knee-safe
                      </Chip>
                    )}
                  </span>
                  <span className={styles.reason}>{exercise.primaryMuscles.join(' · ')}</span>
                  <span className={styles.meta}>
                    <Chip variant="tinted" tint={PROGRESSION_TINT[exercise.progression.type]}>
                      {exercise.progression.label}
                    </Chip>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className={styles.footer}>
          {swapped && (
            <button type="button" className={styles.footerButton} onClick={onRevert}>
              Back to {prescribed?.name}
            </button>
          )}
          <button type="button" className={styles.footerButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
