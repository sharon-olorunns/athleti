import { useState } from 'react';
import type { ProgrammeDay } from '@/types';
import { Chip } from '@/components/Chip';
import { useApp } from '@/state/store';
import { isDeloadWeek } from '@/core/schedule';
import { DayView } from './DayView';
import { DeferredView } from './DeferredView';
import styles from './ProgrammeScreen.module.css';

const DEFERRED = 'deferred';

/**
 * "Day A · Mon" is too wide for a tab at 320px, and the weekday is a suggestion
 * rather than a fixture — the day it names is on the card itself.
 */
function shortDayLabel(day: ProgrammeDay): string {
  return (day.dayLabel.split('·')[0] ?? day.dayLabel).trim();
}

/**
 * Section 5.6 — the programme as a reference document, in-app and read-only.
 *
 * One day at a time with a pinned selector, rather than one long scroll: five days
 * of blocks is a lot of content to thumb through on a phone.
 */
export function ProgrammeScreen({ onOpenExercise }: { onOpenExercise: (id: string) => void }) {
  const programme = useApp((s) => s.programme);
  const days = useApp((s) => s.days);
  const library = useApp((s) => s.library);
  const exercise = useApp((s) => s.exercise);
  const currentWeek = useApp((s) => s.currentWeek());
  const [selected, setSelected] = useState<string | undefined>(undefined);

  if (programme === undefined) return null;

  // No day pinned yet means the first one; the ids come from the seed, so the
  // screen never hard-codes one.
  const selectedId = selected ?? days[0]?.id;
  const day = days.find((d) => d.id === selectedId);
  const deferredSelected = selected === DEFERRED;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.name}>{programme.name}</h1>
        <div className={styles.sub}>
          <Chip variant="tinted" tint="var(--accent)">
            {programme.phase}
          </Chip>
          <Chip>Week {currentWeek}</Chip>
          {isDeloadWeek(currentWeek) && (
            <Chip variant="solid" tint="var(--cns-moderate)">
              DELOAD
            </Chip>
          )}
        </div>
        {programme.notes !== undefined && <p className={styles.notes}>{programme.notes}</p>}
      </header>

      <main className={styles.content}>
        {deferredSelected ? (
          <DeferredView
            schedule={programme.reintroductionSchedule}
            exercise={exercise}
            currentWeek={currentWeek}
            removed={[...library.values()].filter((e) => e.userExcluded)}
          />
        ) : day !== undefined ? (
          <DayView day={day} exercise={exercise} onOpenExercise={onOpenExercise} />
        ) : null}
      </main>

      <nav className={styles.selector} aria-label="Programme days">
        {days.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`${styles.tab} ${d.id === selectedId ? styles.tabActive : ''}`}
            aria-current={d.id === selectedId}
            onClick={() => setSelected(d.id)}
          >
            {shortDayLabel(d)}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.tab} ${deferredSelected ? styles.tabActive : ''}`}
          aria-current={deferredSelected}
          onClick={() => setSelected(DEFERRED)}
        >
          Deferred
        </button>
      </nav>
    </div>
  );
}
