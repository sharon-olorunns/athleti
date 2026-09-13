import { useEffect } from 'react';
import { useApp } from './state/store';
import { ProgrammeScreen } from './screens/Programme/ProgrammeScreen';
import styles from './App.module.css';

export default function App() {
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const boot = useApp((s) => s.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

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
    // First run reads the seed and writes the library; subsequent loads are instant.
    return (
      <div className={styles.boot}>
        <p className={styles.bootBody}>Loading programme…</p>
      </div>
    );
  }

  return <ProgrammeScreen />;
}
