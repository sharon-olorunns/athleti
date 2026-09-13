import { useState } from 'react';
import { Chip } from '@/components/Chip';
import { useApp } from '@/state/store';
import { isDeloadWeek } from '@/core/schedule';
import { DayView } from './DayView';
import { DeferredView } from './DeferredView';
import styles from './ProgrammeScreen.module.css';

const DEFERRED = 'deferred';

/**
 * Section 5.6 — the programme as a reference document, in-app and read-only.
 *
 * One day at a time with a pinned selector, rather than one long scroll: five days
 * of blocks is a lot of content to thumb through on a phone.
 */
export function ProgrammeScreen({ onOpenExercise }: { onOpenExercise: (id: string) => void }) {
  const programme = useApp((s) => s.programme);
  const exercise = useApp((s) => s.exercise);
  const currentWeek = useApp((s) => s.currentWeek());
  const [selected, setSelected] = useState<string>(() => 'day-1');

  if (programme === undefined) return null;

  const day = programme.days.find((d) => d.id === selected);
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
          />
        ) : day !== undefined ? (
          <DayView day={day} exercise={exercise} onOpenExercise={onOpenExercise} />
        ) : null}
      </main>

      <nav className={styles.selector} aria-label="Programme days">
        {programme.days.map((d, index) => (
          <button
            key={d.id}
            type="button"
            className={`${styles.tab} ${d.id === selected ? styles.tabActive : ''}`}
            aria-current={d.id === selected}
            onClick={() => setSelected(d.id)}
          >
            Day {index + 1}
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
