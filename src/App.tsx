import { useEffect, useState } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { ProgrammeScreen } from './screens/Programme/ProgrammeScreen';
import { TodayScreen } from './screens/Today/TodayScreen';
import { WorkoutScreen } from './screens/Workout/WorkoutScreen';
import { useApp } from './state/store';
import { useWorkout } from './state/workoutStore';
import styles from './App.module.css';

export default function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const boot = useApp((s) => s.boot);

  const session = useWorkout((s) => s.session);
  const resumeActive = useWorkout((s) => s.resumeActive);

  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    void boot();
  }, [boot]);

  // Pick up an unfinished session left by a crash, a closed tab or a dead battery.
  useEffect(() => {
    if (status === 'ready') void resumeActive();
  }, [status, resumeActive]);

  if (status === 'error') {
    return (
      <div className={styles.boot}>
        <h1 className={styles.bootTitle}>Could not load the programme</h1>
        <p className={styles.bootBody}>
          The stored data could not be opened. Nothing has been deleted — reloading is safe.
        </p>
        {error !== undefined && <pre className={styles.error}>{error}</pre>}
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div className={styles.boot}>
        <p className={styles.bootBody}>Loading programme…</p>
      </div>
    );
  }

  return (
    <>
      {tab === 'today' ? (
        session === undefined ? (
          <TodayScreen onStarted={() => setTab('today')} />
        ) : (
          <WorkoutScreen onFinished={() => setTab('today')} />
        )
      ) : (
        <ProgrammeScreen />
      )}
      <TabBar active={tab} onChange={setTab} workoutActive={session !== undefined} />
    </>
  );
}
