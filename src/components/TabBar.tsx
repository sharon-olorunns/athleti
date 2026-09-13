import styles from './TabBar.module.css';

export type Tab = 'today' | 'history' | 'progress' | 'programme' | 'settings';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'today', label: 'Today', glyph: '●' },
  { id: 'history', label: 'History', glyph: '☷' },
  { id: 'progress', label: 'Progress', glyph: '◔' },
  // 'Plan' rather than 'Programme': the longer word does not fit a fifth of a
  // 320px bar without truncating. The screen itself keeps its full title.
  { id: 'programme', label: 'Plan', glyph: '☰' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  /** Marks the Today tab while a session is in progress. */
  workoutActive: boolean;
}

export function TabBar({ active, onChange, workoutActive }: Props) {
  return (
    <nav className={styles.bar} aria-label="Sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.tab} ${tab.id === active ? styles.active : ''}`}
          aria-current={tab.id === active}
          onClick={() => onChange(tab.id)}
        >
          <span className={styles.glyph} aria-hidden="true">
            {tab.glyph}
          </span>
          {tab.id === 'today' && workoutActive && <span className={styles.dot} />}
          <span className={styles.label}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
