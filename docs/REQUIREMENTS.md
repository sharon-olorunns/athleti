# Trainer — Requirements

A single-user, offline-first workout tracker and gym timer for the web. Hevy-shaped, but built around one specific training programme and its progression rules.

**Deliverable:** an installable web app that runs entirely on the user's phone, with no account and no server.

**Companion file:** `seed-programme.json` — the exercise library and the five programme days. The app loads this on first run. Do not invent programme content; use that file as the source of truth.

---

## 1. Context

One user. A 9–5 office worker who plays football once or twice a week and trains four times a week in a commercial gym. They are currently managing anterior knee pain, so the programme is in a modified "Phase 1" and the pain needs tracking.

The app is used **standing in a gym, on a phone, one-handed, with sweaty hands, often with no mobile signal, between sets of 30 to 120 seconds.** Every design decision follows from that sentence. It is not used at a desk.

### What makes this different from Hevy

Hevy assumes every exercise progresses by adding weight. This programme has **four different progression currencies**, and applying the wrong one actively ruins the exercise — adding load to a jump turns it into a strength exercise and deletes its purpose. The app's core job is to prompt the *right* progression for each exercise. This is the feature that justifies building it rather than using an existing tracker.

---

## 2. Product principles

These are binding constraints, not aspirations. Where a design decision is ambiguous, resolve it with these.

1. **Logging a set that went as planned takes one tap.** Every set is pre-filled with what was done last time. The common case is confirmation, not data entry. If the user has to type numbers on a normal set, the design has failed.
2. **Thumb-reachable.** All primary actions sit in the bottom third of the screen. Nothing that gets tapped mid-workout lives in a top corner.
3. **Tap targets are at least 48×48 px.** Sweaty hands, sometimes gloves.
4. **Glanceable.** Numbers the user reads mid-set — reps, weight, timer — are large and high contrast. The app gets looked at for two seconds at a time.
5. **Never lose data.** Persist on every mutation, not on session end. A closed tab, a crashed browser or a dead battery mid-workout must lose nothing already logged.
6. **Works with no signal.** Fully offline after first load. No network request is ever on the critical path.
7. **Dark by default.** Gym lighting and battery life. Light theme available but dark is the default.
8. **No blocking modals during a workout.** Confirmations, prompts and errors appear as inline banners or sheets that can be ignored. Never interrupt someone mid-set with a dialog.
9. **The app never nags about missed sessions.** It's a log, not a coach with opinions about your week.

---

## 3. Technical requirements

The stack is the implementer's choice, but it must satisfy all of the following:

- **Runs entirely client-side.** No backend, no auth, no API keys.
- **Installable as a PWA** — web app manifest, service worker, works offline after first load, launches from the home screen without browser chrome.
- **IndexedDB for storage**, not `localStorage`. Workout history grows unbounded and `localStorage` is a synchronous 5 MB cliff. Use a thin wrapper (Dexie or idb) rather than raw IndexedDB.
- **TypeScript**, with the data model in section 4 as actual types.
- **Deployable as static files** to Netlify, Vercel or GitHub Pages with no configuration beyond a build command.
- **Testable core logic** — the progression engine and the timer maths must be pure functions with unit tests. UI tests are optional.

**Recommended, if no strong reason otherwise:** React + Vite + TypeScript, Dexie for storage, Zustand or React Context for state, and CSS Modules or Tailwind. Avoid heavy component libraries; this is a handful of bespoke screens and a component kit will fight the gym-floor constraints above.

### Browser support

Modern mobile Safari and Chrome. The primary device is a phone. The layout must not break on desktop but desktop is not a design target.

---

## 4. Data model

```ts
type ProgressionType = 'load' | 'quality' | 'time' | 'fixed';

type Equipment =
  | 'barbell' | 'trap-bar' | 'dumbbell' | 'kettlebell' | 'cable'
  | 'machine' | 'smith' | 'landmine' | 'sled' | 'band'
  | 'bodyweight' | 'med-ball' | 'plate' | 'erg' | 'box';

type TrackedField = 'weight' | 'reps' | 'seconds' | 'distance';

type CnsLoad = 'high' | 'moderate' | 'low';

type TimerMode = 'rest' | 'hold' | 'interval';

// ---------- Library (seeded, user-extendable) ----------

interface Exercise {
  id: string;                    // kebab-case, stable, never reused
  name: string;
  equipment: Equipment[];
  primaryMuscles: string[];      // display strings, e.g. "Glute max"
  secondaryMuscles: string[];
  tracks: TrackedField[];        // which inputs the set row shows
  unilateral: boolean;           // logged per side
  progression: ProgressionRule;
  cue?: string;                  // one-line coaching note shown on the card
  kneeSensitive: boolean;        // loads the front of the knee
  painTracked: boolean;          // prompts for a pain score after the exercise
  phase1Excluded: boolean;       // deferred until the week-5 reassessment
  reintroduceWeek?: number;      // when phase1Excluded
  alternatives: Alternative[];
}

interface ProgressionRule {
  type: ProgressionType;
  label: string;                 // shown verbatim in the UI, e.g. "+2.5–5 kg/wk"
  repRange?: [number, number];   // for 'load', enables double progression
  incrementKg?: number;          // smallest sensible jump
  inverse?: boolean;             // true = the number goes DOWN (assisted pull-up)
  neverAddLoad?: boolean;        // true = hard-block weight suggestions (Nordics, plyos)
  holdIncrementSeconds?: number; // for 'time'
  note?: string;                 // longer explanation, shown on exercise detail
}

interface Alternative {
  exerciseId?: string;           // if it exists in the library
  name: string;
  reason: string;                // "machine taken", "no sled", "knee sore"
  kneeSafe: boolean;
}

// ---------- Programme (seeded) ----------

interface Programme {
  id: string;
  name: string;
  phase: string;                 // "Phase 1 — knee-adapted"
  days: ProgrammeDay[];
}

interface ProgrammeDay {
  id: string;
  dayLabel: string;              // "Day 1 · Mon"
  title: string;                 // "Lower Strength + Power"
  cnsLoad: CnsLoad;
  targetMinutes: number;
  atHome: boolean;               // Day 3 is not a gym trip
  blocks: Block[];
  note?: string;
}

interface Block {
  letter: string;                // "W", "A", "B", "C"
  name: string;                  // "Power & acceleration"
  estimatedMinutes: number;
  items: BlockItem[];
}

type BlockItem =
  | { kind: 'single'; prescription: Prescription }
  | { kind: 'superset'; label: string; restBetweenPairsSeconds: number;
      prescriptions: Prescription[] };

interface Prescription {
  exerciseId: string;
  sets: number;
  reps?: string;                 // "5", "6-8", "8-10" — a range means double progression
  holdSeconds?: number;          // isometrics
  distanceM?: number;            // sled, carries
  restSeconds: number;
  perSide: boolean;
  cutFirst: boolean;             // drop this when short on time
  kneeModified: boolean;         // show the KNEE badge
  timerMode: TimerMode;
  interval?: { workSeconds: number; restSeconds: number; rounds: number };
  note?: string;
}

// ---------- Logged data ----------

interface WorkoutSession {
  id: string;
  programmeDayId: string;
  weekNumber: number;            // 1-indexed from programme start; week 5 = deload
  startedAt: number;             // epoch ms
  finishedAt?: number;
  entries: LoggedExercise[];
  prePainScore?: number;         // 0–10, optional, asked at session start
  postPainScore?: number;
  notes?: string;
}

interface LoggedExercise {
  exerciseId: string;            // what was ACTUALLY performed
  substitutedForId?: string;     // what the programme prescribed, if swapped
  substitutionReason?: string;
  sets: LoggedSet[];
  painScore?: number;            // 0–10, if exercise.painTracked
  qualityConfirmed?: boolean;    // for progression.type === 'quality'
  skipped?: boolean;
}

interface LoggedSet {
  setIndex: number;              // 0-based
  side?: 'L' | 'R';              // unilateral only
  weightKg?: number;
  reps?: number;
  seconds?: number;
  distanceM?: number;
  wasClean: boolean;             // hit the target with good form — drives progression
  completedAt: number;
}

// ---------- Ancillary ----------

interface MorningCheck {
  date: string;                  // ISO yyyy-mm-dd
  kneeScore: number;             // 0–10
  priorSessionId?: string;
}

interface TimerState {
  mode: TimerMode;
  endsAt: number;                // epoch ms — the single source of truth
  totalSeconds: number;
  paused: boolean;
  remainingWhenPaused?: number;
  contextLabel: string;          // "Trap bar deadlift · set 2 of 4"
  interval?: { round: number; totalRounds: number; phase: 'work' | 'rest' };
}

interface Settings {
  theme: 'dark' | 'light' | 'system';
  units: 'kg' | 'lb';
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  keepScreenAwake: boolean;      // Wake Lock during active workouts
  autoStartRestTimer: boolean;   // default true
  plateIncrementKg: number;      // default 2.5
}
```

---

## 5. Screens

### 5.1 Today (home)

The landing screen. Answers "what am I doing and how's it going" in one glance.

- Which programme day is next, its title, CNS load chip and target duration
- Current week number, with a deload badge on week 5
- A **Start workout** button — the largest thing on the screen
- Last session: date, day title, duration, and whether every prescribed set was completed
- Knee trend: a small sparkline of pain scores over the last 14 days, with the direction called out in words ("settling", "flat", "worsening") rather than only as a line
- A secondary action to start a different day than the one suggested

The next-day suggestion is the day after the last one logged, wrapping at Day 5. The user can always override.

### 5.2 Active workout — the core screen

Everything else is supporting cast. Get this right.

**Layout, top to bottom:**

- A slim header: day title, elapsed time vs target (`34:12 / 70:00`), amber once over target. Tapping it opens session notes.
- A scrollable list of **blocks**, each with its letter badge, name and estimated minutes.
- Within a block, exercises as cards. Supersets are drawn as one card containing both exercises with a visible connecting rail, labelled with the pairing instruction.
- The **current exercise card is expanded**; completed ones collapse to a one-line summary (`Trap bar deadlift — 4×5 @ 80kg ✓`). Upcoming ones show name, target and muscles.
- Pinned above the tab bar: the **timer bar** (section 6), visible on every screen while running.

**The expanded exercise card contains:**

1. Name, equipment chips, KNEE badge if `kneeModified`
2. Muscle chips
3. The coaching cue, if present
4. **The progression banner** (section 7) — one line, colour-coded by progression type
5. Set rows
6. A row of actions: **Swap** (alternatives), **Add set**, **Skip exercise**, **Notes**

**Set rows** are the heart of it:

- One row per set, numbered. Unilateral exercises get two rows per set, marked L and R.
- Each row is pre-filled with the values from the last time this exercise was performed. Show the previous performance as ghost text on the right (`prev 4×8 @ 60`).
- The row has steppers, not free-text fields, as the primary input: `− 60.0 kg +` and `− 8 +`. Tapping the number opens a numeric keypad for a direct edit.
- A large **✓** completes the set. One tap when nothing changed.
- Completing a set: marks it done, records `completedAt`, starts the rest timer if enabled, and advances focus to the next row.
- Long-press or swipe a completed row to un-complete it.
- A **clean/grind toggle** on each row, defaulting to clean. This feeds the progression engine — "did you hit the target with good form". Keep it to one tap; do not build an RPE slider.

**Finishing:** a Finish button at the bottom of the list. If sets remain unlogged it asks once, inline, whether to mark them skipped. On finish, write `finishedAt`, prompt for `postPainScore` if any exercise was `painTracked`, and return to Today with a summary.

### 5.3 Exercise detail

Reached by tapping an exercise name anywhere.

- Muscles worked, equipment, cue
- Its progression rule explained in full (`progression.note`)
- **History:** every past performance, newest first — date, sets, and the top set
- **Chart:** estimated 1RM over time for `load` exercises; total hold seconds for `time`; nothing for `quality` and `fixed` (show the history list only — plotting a jump's "weight" is meaningless and misleading)
- **Alternatives** list (section 8)

### 5.4 History

Reverse-chronological list of sessions. Each row: date, day title, duration, set count, completion percentage, pain score if recorded. Tap to open a read-only session view.

### 5.5 Progress

- Per-exercise strength charts, picked from a searchable list
- **Knee pain chart** — session scores and morning-after scores on one timeline, with the 0–3 / 4–6 / 7+ bands shaded. This is the chart that answers "is this actually getting better", so give it real care.
- Weekly set volume by muscle group
- Session adherence: sessions completed per week against four

### 5.6 Programme

Read-only view of all five days, exactly as prescribed, with the reintroduction schedule for the excluded exercises. Effectively the reference document, in-app.

### 5.7 Settings

Theme, units, sound, vibration, keep-screen-awake, auto-start timer, plate increment. Plus **Export** and **Import** (section 10).

---

## 6. The gym timer

Three modes. All three share one timer surface.

| Mode | Used for | Behaviour |
|---|---|---|
| `rest` | Between sets | Counts down from `prescription.restSeconds`. Auto-starts on set completion. |
| `hold` | Isometrics — Spanish squat, wall sit, Copenhagen | Counts down the **work** period from `holdSeconds`. Started manually by the user when they get into position. On reaching zero it completes the set and starts the rest timer. |
| `interval` | Conditioning — 8 × 20s on / 40s off | Alternates work and rest for `rounds` rounds, announcing each transition. Shows round `n of N`. |

### Visual requirements

- Always visible while running as a pinned bar above the tab bar: remaining time, context label, and a skip button.
- Tapping the bar expands it to a full-screen view with a large countdown, a circular progress ring, and **−15s / +15s / Pause / Skip** controls.
- The last 10 seconds change colour and the ring pulses.

### Technical requirements — read these carefully

**Store `endsAt` as an absolute epoch timestamp and derive the remaining time from `Date.now()` on each render.** Never accumulate elapsed time by decrementing a counter in `setInterval`. Background tabs throttle timers to once per minute or suspend them entirely, so a counting approach drifts badly or stops, which is exactly the failure mode that makes a gym timer useless.

- Persist `TimerState` to IndexedDB on every change, so a reload mid-rest resumes correctly.
- On `visibilitychange` back to visible, recompute. If the timer elapsed while hidden, fire the alert immediately and show "rest finished 40s ago" rather than silently resetting.
- **Audio:** create the `AudioContext` and pre-decode the alert sound on the **first user gesture of the session** — iOS Safari will not play audio from a context created outside a gesture. Do this when the workout starts, not when the first timer fires.
- **Vibration:** `navigator.vibrate` on reaching zero. Works on Android; iOS Safari does not support it. Never rely on vibration alone.
- **Wake Lock:** request a screen wake lock while a workout is active, if `settings.keepScreenAwake`. Release it on finish and re-request on visibility change, since the lock is dropped when the page is hidden.
- **Notifications:** if permission has been granted, post a notification on timer completion as a supplementary alert. Ask for permission once, at the point the user first finishes a rest with the app backgrounded — never on first launch.

**Known limitation, accept for v1:** a fully suspended browser tab on iOS cannot be guaranteed to play a sound at the exact moment the timer hits zero. The mitigations above (wake lock, compute-on-resume, notifications) cover the realistic cases. Do not attempt to work around this with a looping silent audio element; the battery cost is not worth it. Document the limitation in the README.

### Default rest times

Come from `prescription.restSeconds` in the seed data. The user can override per set with ±15s; that override applies to the remaining sets of that exercise in that session only, and is not persisted to the programme.

---

## 7. The progression engine

The differentiating feature. Each exercise declares one of four progression types, and the app prompts accordingly. **Never suggest adding weight to an exercise whose rule says otherwise.**

### 7.1 `load` — add weight

Double progression. Given `repRange: [6, 8]` and `incrementKg: 2.5`:

- If the last session hit the **top of the range on every set with `wasClean: true`**, prompt: *"All sets at 8 clean last time → try 62.5 kg"* and pre-fill the new weight at the bottom of the range.
- Otherwise pre-fill last session's weight and prompt: *"Last time 4×7 @ 60 kg. Aim for 8s."*
- If the last two sessions both failed to progress at the same weight and reps, prompt: *"Stalled two weeks — drop to 60% for one session, then rebuild."*

`inverse: true` (assisted pull-up) reverses the direction: the suggestion **reduces** the assistance weight, and the copy says so explicitly — *"Assistance down to 25 kg"*.

### 7.2 `quality` — never add weight

Plyometrics, jumps, sprints, med ball work. `neverAddLoad` is true and the UI must not show a weight suggestion at all.

Instead the banner states what is actually being progressed (`progression.label`, e.g. "↑ Bar speed"), and after the exercise the app asks one binary question: *"Was bar speed maintained on every rep?"* → Yes / No, stored as `qualityConfirmed`. Two consecutive "No"s prompt: *"Quality dropping — reduce sets rather than pushing through."*

For the weight input on `quality` exercises that still carry load (trap bar jump), pre-fill last session's weight and leave it there. Do not suggest increases.

### 7.3 `time` — hold longer, or progress the lever

Isometrics, carries, the Copenhagen. Suggest `holdIncrementSeconds` more once the last session's holds were all completed clean — *"All 5 × 45s held → try 50s"*.

The Copenhagen is special: its progression is **lever length**, not time or weight. Its `progression.note` explains this, and after four sessions at the top of the time range the app prompts to move from knee-supported to ankle-supported. Treat this as a text prompt, not an automated change.

### 7.4 `fixed` — nothing goes up

Warm-ups, mobility, the agility ladder. No banner, no prompt, no chart. These exist to prepare or maintain and progressing them just adds fatigue.

### 7.5 Deload weeks

Week 5, and every fifth week after, is a deload. On a deload week the app reduces suggested **sets** by roughly 40% (round down, minimum 2) while keeping the weight suggestion unchanged, and shows a banner explaining that intensity is held and volume is cut. The user can override.

---

## 8. Exercise alternatives

Required in v1. The machine is taken, the sled is in use, or the knee is having a bad day — the user needs a substitute in two taps without leaving the workout.

- Every exercise in the library carries an `alternatives` array, seeded in `seed-programme.json`.
- **Swap** on the exercise card opens a sheet listing alternatives, each showing its name, the reason it's offered ("no sled available", "knee-friendlier") and a **knee-safe** marker.
- Alternatives are sorted knee-safe first when the exercise is `kneeSensitive` or when the last recorded pain score was 4 or higher.
- Choosing one replaces the exercise **for this session only**. The logged entry records `exerciseId` as what was actually done and `substitutedForId` as what was prescribed, so history stays honest and the programme is unchanged.
- The sheet also offers a search over the whole library, for a substitute that isn't in the curated list.
- If a swapped exercise has been used three or more times in place of the same prescribed exercise, offer — once, on the Today screen, not mid-workout — to make the substitution permanent.

Alternatives must preserve the progression type where possible. If the chosen substitute has a different progression type, its own rule applies, and its history is tracked under its own id.

---

## 9. Pain tracking

Specific to this user's current knee, but built generally: any exercise with `painTracked: true` prompts for a score.

- After the final set of a `painTracked` exercise, an inline row appears: *"Knee during that? "* with a 0–10 tap scale. It is skippable and never blocks progress.
- The scale is colour-banded: **0–3 green**, **4–6 amber**, **7–10 red**, matching the programme's traffic-light rule.
- Scoring 4+ shows a one-line inline hint: *"Cut range first, weight second."* Scoring 7+ suggests swapping to a knee-safe alternative and offers the swap sheet directly.
- **Session-level:** ask `prePainScore` once at workout start and `postPainScore` once at finish. Both optional.
- **Morning check:** on first app open of any day following a session, a dismissible card asks *"How was the knee this morning?"* with the same 0–10 scale, stored as a `MorningCheck`. This matters more than the in-session number — the programme's rule is that pain settling within 24 hours is acceptable — so the Progress chart must plot morning scores prominently.
- The app must never display an interpretation of pain scores beyond the banded colours and the two hints above. It is a log, not a diagnosis.

---

## 10. Export and import

No server means the user's only backup is their own export. Make it trustworthy.

- **Export** writes a single JSON file containing all sessions, settings, custom exercises and programme modifications, with a schema version field. Filename `trainer-export-YYYY-MM-DD.json`.
- **Import** accepts that file, validates the schema version, and offers **merge** (by session id, newest wins) or **replace**. Show a summary of what will change before committing.
- Prompt for an export if more than 30 days have passed since the last one. Once, dismissible, on the Today screen.
- Also offer a CSV export of set history, for anyone who wants it in a spreadsheet.

---

## 11. Out of scope for v1

Do not build these. They are listed so they are not accidentally started.

- Accounts, login, cloud sync, multi-device
- Social features, sharing, feeds
- A general routine builder — the programme is seeded and editable in place, but there is no "create a new programme from scratch" flow
- Exercise demonstration videos or images
- Apple Health / Google Fit integration
- Body weight, measurements, nutrition, photos
- Warm-up set calculators, plate maths, 1RM testing protocols
- Notifications that aren't timer alerts

---

## 12. Acceptance criteria

The build is done when all of these are true on a phone:

1. Installing to the home screen and opening in aeroplane mode gives a fully working app.
2. Starting Day 1, logging every set, and finishing produces a session in History with the correct duration and set count.
3. Logging a set where nothing changed from last time takes exactly one tap.
4. Completing a set auto-starts the rest timer at the prescribed duration.
5. Locking the phone for 60 seconds during a 90-second rest, then reopening, shows approximately 30 seconds remaining — not 90, and not a stopped timer.
6. When a rest timer elapses while the app is backgrounded, reopening it immediately shows that rest has finished and how long ago.
7. The trap bar jump never shows a suggestion to add weight, in any circumstance.
8. The trap bar deadlift, after a session of 4×8 all marked clean, suggests the next weight up at 6 reps.
9. The assisted pull-up suggests *less* assistance, and its copy says so.
10. Swapping an exercise mid-workout records both the performed and the prescribed exercise, and leaves the programme unchanged next session.
11. Recording a knee pain score of 7 offers knee-safe alternatives.
12. Exporting, clearing site data, and importing restores every session exactly.
13. The app is usable one-handed: every action needed during a workout is reachable with a thumb.
14. Killing the browser mid-workout and reopening resumes the session with all logged sets intact.

---

## 13. Suggested build order

Ship each milestone working before starting the next.

1. **Data layer.** Types, IndexedDB schema, seed loader that reads `seed-programme.json` on first run. A page that renders the programme read-only proves it works.
2. **Active workout, logging only.** Set rows, pre-fill from history, completion, session persistence. No timer yet.
3. **The timer.** All three modes, the pinned bar, the expanded view, and the background-correctness behaviour in section 6. Unit-test the timer maths before wiring the UI.
4. **Progression engine.** Pure functions, unit-tested against the cases in section 12, then the banners.
5. **Alternatives and pain tracking.**
6. **History and Progress**, including the knee chart.
7. **PWA shell** — manifest, service worker, offline, install prompt.
8. **Export/import**, settings, polish.

---

## 14. Notes for the implementer

- The seed data in `seed-programme.json` is the programme as prescribed, including the exercises marked `phase1Excluded`. Those must be present in the library and visible on the Programme screen with their reintroduction week, but must not appear in any day's blocks.
- Rep strings like `"6-8"` mean a range and enable double progression. `"5"` means a fixed target. Parse both.
- Some prescriptions have no weight at all (`tracks` without `'weight'`). The set row must adapt to the fields the exercise actually tracks rather than always showing a weight box.
- Distances are in metres, holds in seconds, weights in kilograms internally regardless of the display unit setting. Convert at the boundary only.
- The estimated-minutes values on blocks are for display and pacing; do not use them to drive any logic.
