import { useEffect, useState } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { TimerRunner } from './components/timer/TimerRunner';
import { useWakeLock } from './hooks/useWakeLock';
import { ExerciseDetail } from './screens/ExerciseDetail/ExerciseDetail';
import { HistoryScreen } from './screens/History/HistoryScreen';
import { ProgrammeScreen } from './screens/Programme/ProgrammeScreen';
import { ProgressScreen } from './screens/Progress/ProgressScreen';
import { TodayScreen } from './screens/Today/TodayScreen';
import { WorkoutScreen } from './screens/Workout/WorkoutScreen';
import { useApp } from './state/store';
import { useTimer } from './state/timerStore';
import { useWorkout } from './state/workoutStore';
import styles from './App.module.css';

export default function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const boot = useApp((s) => s.boot);

  const session = useWorkout((s) => s.session);
  const resumeActive = useWorkout((s) => s.resumeActive);
  const restoreTimer = useTimer((s) => s.restore);
  const settings = useApp((s) => s.settings);

  const [tab, setTab] = useState<Tab>('today');
  // Exercise detail is reachable from anywhere, so it overlays rather than routes.
  const [detailId, setDetailId] = useState<string | undefined>(undefined);

  // Keep the screen awake during a workout, if the setting allows it.
  useWakeLock(session !== undefined && settings.keepScreenAwake);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Pick up an unfinished session left by a crash, a closed tab or a dead battery,
  // and the timer that was running with it.
  useEffect(() => {
    if (status !== 'ready') return;
    void resumeActive();
    void restoreTimer();
  }, [status, resumeActive, restoreTimer]);

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
      {tab === 'today' &&
        (session === undefined ? (
          <TodayScreen onStarted={() => setTab('today')} />
        ) : (
          <WorkoutScreen onFinished={() => setTab('today')} />
        ))}
      {tab === 'history' && <HistoryScreen onOpenExercise={setDetailId} />}
      {tab === 'progress' && <ProgressScreen />}
      {tab === 'programme' && <ProgrammeScreen onOpenExercise={setDetailId} />}

      {detailId !== undefined && (
        <ExerciseDetail exerciseId={detailId} onClose={() => setDetailId(undefined)} />
      )}
      <TimerRunner />
      <TabBar active={tab} onChange={setTab} workoutActive={session !== undefined} />
    </>
  );
}
