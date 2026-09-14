import { useRef, useState } from 'react';
import type { Settings } from '@/types';
import {
  backupFilename,
  parseBackup,
  planImport,
  toCsv,
  type ImportMode,
  type MergePlan,
  type BackupFile,
} from '@/core/backup';
import { clampStage, gateFor, stageFor } from '@/core/ladder';
import { applyImport, readBackup, seededExerciseIds } from '@/db/backup';
import { META_KEYS, setMeta } from '@/db/db';
import { startKeepAlive, stopKeepAlive } from '@/platform/audio';
import { downloadFile } from '@/platform/download';
import { useApp } from '@/state/store';
import { useWorkout } from '@/state/workoutStore';
import styles from './Settings.module.css';

/** A segmented choice between a small fixed set of options. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <span className={styles.segments} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.segment} ${option.value === value ? styles.segmentActive : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}

interface PendingImport {
  backup: BackupFile;
  plan: MergePlan;
  mode: ImportMode;
}

/** Section 5.7 — the settings, and the export and import that back the data up. */
export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const library = useApp((s) => s.library);
  const boot = useApp((s) => s.boot);
  const exerciseById = useApp((s) => s.exercise);

  const ladder = useApp((s) => s.ladder)();

  const history = useWorkout((s) => s.history);
  const workoutActive = useWorkout((s) => s.session !== undefined);
  const loadHistory = useWorkout((s) => s.loadHistory);
  const morningChecks = useApp((s) => s.morningChecks);

  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    void updateSettings({ [key]: value } as Partial<Settings>);
  };

  const exportJson = async () => {
    const now = Date.now();
    const backup = await readBackup(now);
    downloadFile(backupFilename(now), JSON.stringify(backup, null, 2), 'application/json');
    await setMeta(META_KEYS.lastExportAt, now);
    setStatus(`Exported ${backup.sessions.length} sessions.`);
  };

  const exportCsv = async () => {
    const backup = await readBackup();
    const csv = toCsv(backup.sessions, (id) => exerciseById(id)?.name ?? id);
    downloadFile(
      backupFilename(Date.now()).replace('.json', '.csv'),
      csv,
      'text/csv;charset=utf-8',
    );
    setStatus('Set history exported as CSV.');
  };

  /** Parse and plan, but write nothing: the summary is shown first. */
  const pickFile = async (file: File, mode: ImportMode) => {
    setError(undefined);
    setStatus(undefined);
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setPending({
      backup: result.backup,
      mode,
      plan: planImport({
        existingSessions: history,
        existingMorningChecks: morningChecks,
        existingExerciseIds: new Set([...library.keys(), ...seededExerciseIds()]),
        existingSettings: settings,
        backup: result.backup,
        mode,
      }),
    });
  };

  const confirmImport = async () => {
    if (pending === undefined) return;
    await applyImport(pending.plan, pending.backup, pending.mode);
    setPending(undefined);
    // Re-read everything, so the screens show the imported data immediately.
    await boot();
    await loadHistory();
    setStatus(`Imported. ${pending.plan.sessions.length} sessions now stored.`);
  };

  const summary = pending?.plan.summary;

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Settings</h1>

      <h2 className={styles.groupTitle}>Display</h2>
      <div className={styles.group}>
        <div className={`${styles.row} ${styles.rowStacked}`}>
          <span className={styles.label}>
            <span className={styles.labelText}>Theme</span>
            <span className={styles.labelNote}>Dark by default, for gym lighting.</span>
          </span>
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(v) => set('theme', v)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'Auto' },
            ]}
          />
        </div>

        <div className={`${styles.row} ${styles.rowStacked}`}>
          <span className={styles.label}>
            <span className={styles.labelText}>Units</span>
            <span className={styles.labelNote}>
              Weights are stored in kilograms either way.
            </span>
          </span>
          <Segmented
            label="Units"
            value={settings.units}
            onChange={(v) => set('units', v)}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
          />
        </div>

        <div className={`${styles.row} ${styles.rowStacked}`}>
          <span className={styles.label}>
            <span className={styles.labelText}>Plate increment</span>
            <span className={styles.labelNote}>The smallest jump your gym has.</span>
          </span>
          <Segmented
            label="Plate increment"
            value={String(settings.plateIncrementKg)}
            onChange={(v) => set('plateIncrementKg', Number(v))}
            options={[
              { value: '1.25', label: '1.25' },
              { value: '2.5', label: '2.5' },
              { value: '5', label: '5' },
            ]}
          />
        </div>
      </div>

      <h2 className={styles.groupTitle}>During a workout</h2>
      <div className={styles.group}>
        <div className={styles.row}>
          <span className={styles.label}>
            <span className={styles.labelText}>Auto-start rest timer</span>
            <span className={styles.labelNote}>Starts when a set is completed.</span>
          </span>
          <Toggle
            label="Auto-start rest timer"
            checked={settings.autoStartRestTimer}
            onChange={(v) => set('autoStartRestTimer', v)}
          />
        </div>

        <div className={styles.row}>
          <span className={styles.label}>
            <span className={styles.labelText}>Sound</span>
            <span className={styles.labelNote}>A beep when a timer reaches zero.</span>
          </span>
          <Toggle
            label="Sound"
            checked={settings.soundEnabled}
            onChange={(v) => set('soundEnabled', v)}
          />
        </div>

        <div className={styles.row}>
          <span className={styles.label}>
            <span className={styles.labelText}>Vibration</span>
            <span className={styles.labelNote}>Android only; iOS has no vibration API.</span>
          </span>
          <Toggle
            label="Vibration"
            checked={settings.vibrationEnabled}
            onChange={(v) => set('vibrationEnabled', v)}
          />
        </div>

        <div className={`${styles.row} ${styles.rowStacked}`}>
          <span className={styles.label}>
            <span className={styles.labelText}>Alert volume</span>
            <span className={styles.labelNote}>A gym is loud. Full is the default.</span>
          </span>
          <Segmented
            label="Alert volume"
            value={String(Math.round(settings.alertVolume * 100))}
            onChange={(v) => set('alertVolume', Number(v) / 100)}
            options={[
              { value: '25', label: 'Low' },
              { value: '60', label: 'Mid' },
              { value: '100', label: 'Full' },
            ]}
          />
        </div>

        <div className={styles.row}>
          <span className={styles.label}>
            <span className={styles.labelText}>Keep screen on during workouts</span>
            <span className={styles.labelNote}>
              On iPhone this is what makes the alert fire at all. Leave it on.
            </span>
          </span>
          <Toggle
            label="Keep screen on during workouts"
            checked={settings.keepScreenAwake}
            onChange={(v) => set('keepScreenAwake', v)}
          />
        </div>

        <div className={styles.row}>
          <span className={styles.label}>
            <span className={styles.labelText}>Try to play alerts in the background</span>
            <span className={styles.labelNote}>
              Uses more battery. Helps when the app is backgrounded with the screen on; does
              nothing once the phone is locked.
            </span>
          </span>
          <Toggle
            label="Try to play alerts in the background"
            checked={settings.backgroundAudioKeepAlive}
            onChange={(v) => {
              set('backgroundAudioKeepAlive', v);
              // This tap is a user gesture, which is the only moment iOS will let
              // the silent element start playing — so act on it here rather than
              // waiting for the next workout.
              if (!workoutActive) return;
              if (v) startKeepAlive();
              else stopKeepAlive();
            }}
          />
        </div>
      </div>

      {ladder.length > 0 && (
        <>
          <h2 className={styles.groupTitle}>Pull-up ladder</h2>
          <div className={styles.group}>
            <div className={`${styles.row} ${styles.rowStacked}`}>
              <span className={styles.label}>
                <span className={styles.labelText}>Stage</span>
                <span className={styles.labelNote}>
                  {stageFor(ladder, settings.currentLadderStage)?.name}
                  {gateFor(ladder, settings.currentLadderStage) !== undefined
                    ? ` — move up when: ${gateFor(ladder, settings.currentLadderStage)}`
                    : ' — the last rung.'}
                </span>
              </span>
              <Segmented
                label="Pull-up ladder stage"
                value={String(clampStage(ladder, settings.currentLadderStage))}
                onChange={(v) => set('currentLadderStage', Number(v))}
                options={ladder.map((stage) => ({
                  value: String(stage.stage),
                  label: String(stage.stage),
                }))}
              />
            </div>
          </div>
        </>
      )}

      <h2 className={styles.groupTitle}>Your data</h2>
      <div className={styles.group}>
        <button type="button" className={styles.action} onClick={() => void exportJson()}>
          Export backup
          <span className={styles.actionNote}>
            Everything, as one JSON file. This is your only backup.
          </span>
        </button>

        <button type="button" className={styles.action} onClick={() => void exportCsv()}>
          Export set history as CSV
          <span className={styles.actionNote}>For a spreadsheet. Weights in kilograms.</span>
        </button>

        <button
          type="button"
          className={styles.action}
          onClick={() => fileInput.current?.click()}
        >
          Import a backup
          <span className={styles.actionNote}>
            You choose merge or replace, after seeing what changes.
          </span>
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className={styles.hiddenInput}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file !== undefined) void pickFile(file, 'merge');
        }}
      />

      {status !== undefined && <p className={styles.status}>{status}</p>}
      {error !== undefined && <p className={`${styles.status} ${styles.error}`}>{error}</p>}

      <p className={styles.about}>
        Trainer · everything stays on this device
        <br />
        No account, no server, no network.
      </p>

      {pending !== undefined && summary !== undefined && (
        <>
          <div className={styles.scrim} role="presentation" onClick={() => setPending(undefined)} />
          <div className={styles.sheet} role="dialog" aria-label="Confirm import">
            <h2 className={styles.sheetTitle}>
              {pending.mode === 'merge' ? 'Merge this backup?' : 'Replace everything?'}
            </h2>

            <div className={styles.summaryList}>
              <span>
                <span className={styles.summaryValue}>{summary.sessionsAdded}</span> sessions added
              </span>
              {pending.mode === 'merge' && (
                <>
                  <span>
                    <span className={styles.summaryValue}>{summary.sessionsUpdated}</span> updated
                    from the file
                  </span>
                  <span>
                    <span className={styles.summaryValue}>{summary.sessionsUnchanged}</span> already
                    up to date
                  </span>
                </>
              )}
              {summary.sessionsRemoved > 0 && (
                <span className={styles.warn}>
                  <span className={styles.summaryValue}>{summary.sessionsRemoved}</span> sessions on
                  this device will be deleted
                </span>
              )}
              <span>
                <span className={styles.summaryValue}>{summary.morningChecksAdded}</span> morning
                checks added
              </span>
              <span>
                <span className={styles.summaryValue}>{summary.customExercisesAdded}</span> custom
                exercises added
              </span>
              {summary.settingsChange && <span>Settings will be taken from the file</span>}
              {summary.programmeChange && <span>The programme will be taken from the file</span>}
            </div>

            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.sheetButton}
                onClick={() => setPending(undefined)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.sheetButton}
                onClick={() =>
                  setPending({
                    ...pending,
                    mode: pending.mode === 'merge' ? 'replace' : 'merge',
                    plan: planImport({
                      existingSessions: history,
                      existingMorningChecks: morningChecks,
                      existingExerciseIds: new Set([...library.keys(), ...seededExerciseIds()]),
                      existingSettings: settings,
                      backup: pending.backup,
                      mode: pending.mode === 'merge' ? 'replace' : 'merge',
                    }),
                  })
                }
              >
                {pending.mode === 'merge' ? 'Replace instead' : 'Merge instead'}
              </button>
              <button
                type="button"
                className={`${styles.sheetButton} ${styles.primary}`}
                onClick={() => void confirmImport()}
              >
                {pending.mode === 'merge' ? 'Merge' : 'Replace'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
