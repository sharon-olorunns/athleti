# Trainer

A single-user, offline-first workout tracker and gym timer for the web, built
around one specific training programme — The Footballer's Week, Phase 1
(knee-adapted) — and its progression rules.

No account, no server, no network on the critical path. Everything runs on the
phone.

## Why not Hevy

Hevy assumes every exercise progresses by adding weight. This programme has four
different progression currencies, and applying the wrong one actively ruins the
exercise: adding load to a jump turns it into a strength exercise and deletes its
purpose. Prompting the *right* progression for each exercise is the reason this
app exists.

| Currency  | Meaning                                    | Example                     |
|-----------|--------------------------------------------|-----------------------------|
| `load`    | Add weight, via double progression          | Trap bar deadlift           |
| `quality` | Never add weight — speed, height, intent    | Trap bar jump, med ball slam|
| `time`    | Hold longer, or progress the lever          | Spanish squat, Copenhagen   |
| `fixed`   | Nothing goes up                             | Warm-ups, agility ladder    |

## Stack

- **React 18 + TypeScript + Vite** — a handful of bespoke screens, no component library
- **Dexie (IndexedDB)** — history grows unbounded; `localStorage` is a synchronous 5 MB cliff
- **Zustand** for state, **CSS Modules** with custom properties for styling
- **Vitest** for the pure core logic

## Getting started

```sh
npm install
npm run dev        # development server
npm test           # unit tests
npm run build      # production build to dist/
npm run preview    # serve the production build
```

## Deploying

The build is static files with a relative `base`, so it drops onto Netlify,
Vercel or GitHub Pages with no configuration beyond:

- Build command: `npm run build`
- Publish directory: `dist`

## Project layout

```
src/
  core/       Pure, unit-tested logic — no React, no IndexedDB
  db/         Dexie schema, the seed loader and typed accessors
  types/      The data model (section 4 of the requirements) as actual types
  data/       seed-programme.json — the exercise library and five programme days
  state/      Zustand store; a cache over IndexedDB, never the source of truth
  screens/    Screen components
  components/ Shared UI primitives
```

`docs/REQUIREMENTS.md` is the specification this is built against.

## The seed data

`src/data/seed-programme.json` is the source of truth for programme content: 57
exercises and five days. It is loaded into IndexedDB on first run and is not
re-read afterwards, so the user can edit the programme in place without an app
update overwriting them. A newer `schemaVersion` refreshes the seeded library and
programme while leaving user-added exercises, settings and all logged history
untouched.

The 12 exercises marked `phase1Excluded` are deliberately absent from every day's
blocks and appear only under **Deferred**, with the week they are reintroduced.
This is enforced by `validateSeed`, which runs before anything is written — a
seed that puts a jump back into the knee-adapted phase fails to load rather than
loading quietly.

## Build status

The build order follows section 13 of the requirements, each milestone shipped
working before the next is started.

- [x] **1. Data layer** — types, IndexedDB schema, seed loader, and a read-only
      Programme screen that renders all five days and the reintroduction schedule
- [x] **2. Active workout, logging only** — Today screen, set rows with steppers,
      pre-fill from history, one-tap completion, session persistence on every
      mutation, and resume after a crash. No timer yet.
- [x] **3. The timer** — all three modes, the pinned bar, the expanded ring view,
      and the background-correctness behaviour in section 6
- [ ] 4. Progression engine
- [ ] 5. Alternatives and pain tracking
- [ ] 6. History and Progress, including the knee chart
- [ ] 7. PWA shell — manifest, service worker, offline, install prompt
- [ ] 8. Export/import, settings, polish

Until milestone 7 lands the app is a normal web page: it is not yet installable
and not yet offline-capable.

### How the timer behaves

- **Three modes, one surface.** `rest` auto-starts when a set is completed, at
  `prescription.restSeconds`. `hold` is started by the user once they are in
  position and, on reaching zero, logs its own set and rolls into the rest.
  `interval` alternates work and rest for the prescribed rounds, announcing each
  transition with a distinct tone and showing round *n* of *N*.
- **Nothing counts down in JavaScript.** `endsAt` is an absolute timestamp and
  every displayed number is derived from `Date.now()` at render time. The 250ms
  interval exists only to re-render. A throttled or suspended tab can make the
  display stale, never wrong.
- **Returning from the background recomputes immediately** rather than waiting
  for the next tick, so a rest that ran out while the phone was locked reports
  "Rest finished 40s ago" instead of silently resetting.
- **The final interval round has no trailing rest.** The work is over at the end
  of the last work period; a countdown that kept going would only be in the way.
- **±15s does two things**, as the spec describes: it moves the running
  countdown, and it sets the rest for the remaining sets of that exercise in this
  session. It is held in memory and never reaches the programme.

### What is deliberately left out

These belong to later milestones and are not oversights:

- **The progression strip is the seeded rule, not a suggestion.** It shows the
  exercise's own progression currency and label, colour-coded. The engine that
  turns last week's sets into *"All sets at 8 clean last time → try 62.5 kg"* is
  milestone 4, and so is the week-5 deload cut to suggested sets.
- **No Swap button.** Alternatives are milestone 5, so the action is absent
  rather than present and dead.
- **No pain prompts.** `prePainScore`, `postPainScore` and the per-exercise 0–10
  scale come with milestone 5.
- **Notes are session-level.** The data model gives `WorkoutSession` a `notes`
  field and `LoggedExercise` none, so the card's Notes action opens the session
  note rather than inventing a per-exercise field.

### How logging behaves

- **Pre-fill order.** A row opens with the most recent set of that exercise
  already logged in this session, so set 2 follows what set 1 actually did and
  the R side follows the L side. Failing that, the matching set from the last
  time the exercise was performed. Failing that, the prescription — the bottom of
  the rep range, the prescribed hold or distance. Weight is left empty rather
  than guessed, so the first-ever session of a lift asks for it once.
- **Drafts are in memory; logged sets are not.** Every completion, un-completion,
  skip and note writes the whole session to IndexedDB before the UI updates. A
  number typed into a stepper but not confirmed is not persisted — losing that to
  a crash is acceptable, losing a logged set is not.
- **Steppers only where there is a number to step.** The mobility flows prescribe
  `"6 / 30s / 8"` across three movements; there is no single rep count, so the row
  shows the target and the tick logs it as done.
- **Add set** extends the rows for that exercise. Once logged, an extra set
  survives a reload because the row count is derived from what the log contains,
  not from a separate counter.

## Testing

```sh
npm test
```

The progression engine and timer maths are required to be pure functions with
unit tests. What exists so far:

- `core/reps` — rep-string parsing, including the composite strings (`"6 / 30s / 8"`)
  that must never be read as a range
- `core/schedule` — week numbering, the week-5 deload rule, deload set reduction,
  and next-day suggestion with wrapping
- `core/prescription` — per-side set rows, target and prescription display text
- `core/seedValidation` — the seed integrity rules, plus assertions against the
  real seed file covering the progression cases in the acceptance criteria
- `core/workout` — planned set rows, the pre-fill priority above, previous-set
  ghosts, per-currency step sizes, performance summaries, and which card is
  current
- `core/session` — immutable session updates (log, un-log, skip, notes, finish),
  completion stats and clock formatting
- `core/timer` — remaining time, overdue reporting, pause and resume without
  drift, the ±15s adjustment, interval phase transitions, and the countdown
  formatting. Acceptance criteria 5 and 6 are written directly as tests
- `state/timerStore` — the ±15s override rule, and that it never touches the
  programme
- `db/seed` — first-run seeding, idempotence, and that a re-seed preserves user
  settings, user-added exercises and logged sessions

### Platform behaviour

- **Audio** is synthesised with an oscillator rather than loaded from a file, so
  it needs no asset, no fetch and no decode — the app has to work offline from
  first load. The `AudioContext` is created and unlocked on the tap that starts
  the workout, because iOS Safari will not play audio from a context created
  outside a user gesture, and by the time the first timer fires it is too late.
- **Vibration** fires on Android and is absent on iOS Safari, which is why the
  alert is never vibration alone. Both sound and vibration honour their settings.
- **Wake Lock** is held while a workout is active if `keepScreenAwake` is set,
  and re-requested on every return to visibility, since the browser drops it
  whenever the page is hidden.
- **Notifications** are a supplementary alert only. Permission is never
  requested on first launch: it is offered once, inline, after a rest has
  actually elapsed while the app was backgrounded. Until the service worker
  arrives in milestone 7, Android Chrome will refuse the notification
  constructor, and it degrades to nothing rather than throwing into a workout.

## Known limitation — iOS background audio

A fully suspended browser tab on iOS cannot be guaranteed to play a sound at the
exact moment a timer hits zero. This is accepted for v1. The mitigations are a
screen wake lock during a workout, recomputing the timer from an absolute
`endsAt` timestamp on every resume (so reopening shows "rest finished 40s ago"
rather than a stopped or reset timer), and an optional notification. A looping
silent audio element would work around it at a battery cost that is not worth
paying.
