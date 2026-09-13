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

The service worker and manifest are emitted by the build; `base` is relative, so
an install from a project-pages subpath scopes correctly. A service worker needs
HTTPS (or localhost), which all three provide.

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
- [x] **4. Progression engine** — the four currencies, double progression,
      stalls, the inverse rule, the quality question, the lever prompt and the
      week-5 deload, with the banners on the exercise cards
- [x] **5. Alternatives and pain tracking** — the swap sheet with library search,
      substitutions recorded honestly, the 0–10 pain scale, session and
      morning-after checks, and the permanent-substitution offer
- [x] **6. History and Progress** — exercise detail with per-currency charts, the
      session history and read-only session view, the knee chart, weekly volume
      and adherence, plus the Today knee trend
- [x] **7. PWA shell** — manifest, service worker, precached offline shell,
      install offer and a gated update flow
- [ ] 8. Export/import, settings, polish

### The PWA shell

Installable and fully offline after first load. The build emits a manifest and a
Workbox service worker that precaches every asset — HTML, JS, CSS, icons — so
opening the app in aeroplane mode gives the whole thing, not a shell.

- **Updates are never applied on their own.** Registration is manual and the
  waiting worker only takes over when the user taps Update. The offer is withheld
  entirely while a workout is in progress: a reload is safe, since the session is
  persisted on every mutation, but offering one mid-set is exactly the
  interruption the app exists to avoid.
- **The install offer** uses the native prompt where the browser has one, and
  falls back to *Share → Add to Home Screen* on iOS, which has no install API at
  all. It is offered once, remembered when dismissed, and never raised
  mid-workout.
- **Notifications now work on Android**, which refuses the bare `Notification`
  constructor and only accepts `ServiceWorkerRegistration.showNotification`. The
  constructor stays as the desktop fallback.
- **Icons are generated, not committed blind.** `scripts/generate-icons.mjs`
  draws the mark procedurally and writes the PNGs directly, so they are
  reproducible from source with no image toolchain to install.

Run `npm run icons` after changing that script.

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

### How progression works

The differentiating feature. Each exercise declares one of four currencies and
the app prompts for that one only. `suggestProgression` is pure and returns the
banner line, any secondary hint, the values to open the set rows with, and how
many sets to show.

- **`load`** runs double progression. Every set at the top of the range, all
  clean, earns the next weight and pre-fills at the bottom of the range;
  otherwise it holds the weight and names the target. Two sessions stuck at the
  same weight and reps is a stall, and it says so.
- **`quality`** never produces a weight suggestion under any circumstance. The
  banner states what is actually being progressed, and once the sets are logged
  the card asks one binary question, built from the rule's own label — "↑ Bar
  speed" becomes *"Was bar speed maintained on every rep?"*. Two consecutive
  "no" answers add the warning about reducing sets.
- **`time`** suggests a longer hold once every hold was completed clean, but
  only where `holdIncrementSeconds` is positive. A `time` rule does not always
  mean "hold longer": the banded lateral walk pins the increment to 0 because it
  progresses by band stiffness.
- **`fixed`** gets no banner, no prompt and no numbers.

**Pre-fill order.** Each layer overrides only the fields it defines: the
prescription, then the matching set from last time, then the engine's
suggestion, then anything already logged for that exercise in this session. So
a suggestion that names a weight but not a rep count still lets last week's reps
show through, and once set 1 is done, set 2 follows what was actually lifted.

#### Judgement calls worth knowing about

- **Acceptance criterion 8 and the seed disagree.** The criterion says the trap
  bar deadlift, after 4×8 all clean, suggests the next weight up at 6 reps —
  which is section 7.1's worked example (`repRange [6, 8]`, `+2.5 kg`). The
  seeded trap bar deadlift is prescribed 4×5 with `repRange [5, 5]` and a 5 kg
  increment, so the same engine lands on +5 kg at 5 reps for it. The seed is the
  source of truth for programme content, so the engine implements the rule and
  both cases are tested: the example's numbers produce exactly the criterion's
  answer, and the seeded lift produces its own.
- **Stalling on an inverse exercise does not cut to 60%.** On the assisted
  pull-up the load is assistance, so 60% of it is a *harder* set. The same
  intent — back off, then rebuild — is expressed as one step more assistance,
  and the copy says so.
- **The lever prompt is driven by the rule, not by an exercise id.** The seed
  marks the Copenhagen with "↑ Lever length"; any `time` rule whose label names
  the lever gets the prompt after four consecutive sessions holding the
  prescribed time cleanly. It is text only and changes nothing automatically.
- **The deload exempts `fixed`.** Section 7.5 cuts suggested sets by roughly 40%
  on week 5 and every fifth week after, holding the weight suggestion unchanged.
  Warm-ups and mobility are left at their prescribed sets: they sit outside the
  progression machinery, and trimming them buys no recovery. The reduced count
  is used by the set rows, the card headers and the session's completion total
  alike, so they cannot disagree.

### How swapping works

The machine is taken, the sled is in use, or the knee is having a bad day. Swap
on the exercise card opens a sheet of that exercise's own alternatives — each
with the reason it is offered and a knee-safe marker — plus a search over the
whole library for anything the curated list does not name. Knee-safe options are
listed first when the exercise loads the front of the knee, or when the last
recorded pain score was 4 or higher.

A swap applies to this session only. The logged entry records what was actually
performed as `exerciseId` and what the programme prescribed as
`substitutedForId`, so history stays honest and the programme is untouched. Set
rows, the progression banner, completion counting and the session total all work
from what is being performed, and history accrues under the substitute's own id.

After the same substitute has stood in for the same prescribed exercise three
times, the Today screen offers — once, never mid-workout — to make it permanent.
Accepting repoints every prescription naming that exercise in the stored
programme; the seed file is never touched.

#### Free-text alternatives become real exercises

Only 22 of the 105 seeded alternatives name a library exercise; the rest are
free text. Choosing one of those derives a library exercise from it, with a
stable id from the name (`custom-reverse-lunge-to-a-box`), so the same
substitute chosen twice accumulates one history rather than fragmenting.

The derived exercise inherits the tracked fields, muscles and progression rule of
the exercise it stands in for — section 8 asks that the progression type be
preserved where possible, and the set row has to show the same inputs. Knee
sensitivity comes from the alternative's own `kneeSafe` flag rather than the
source.

### How pain tracking works

Any exercise with `painTracked: true` gets an inline 0–10 row after its final
set, colour-banded 0–3 green, 4–6 amber, 7–10 red. It is skippable and never
blocks. Scoring 4 or more shows the programme's own rule — *"Cut range first,
weight second."* — and 7 or more opens the swap sheet directly with knee-safe
options first, plus a standing button to reopen it.

`prePainScore` is asked once at the start of a session that tracks pain, and
`postPainScore` once when finishing, both inline and both skippable. The
morning-after check appears on Today the day following a session and is stored
as a `MorningCheck`.

Nothing here interprets a score beyond those bands and that one hint. It is a
log, not a diagnosis.

#### Judgement calls worth knowing about

- **The morning check is offered on the next day only.** The programme's rule is
  that pain settling within 24 hours is acceptable, so the morning after is the
  reading that matters; asking again three days later would measure nothing, and
  the app does not nag. Dismissing it is remembered for that day.
- **The 0–10 scale is a 4×3 grid, not a row of eleven.** Eleven 48px targets do
  not fit across a 320px screen. Three rows of four keep every target at least
  48px wide on the smallest phone, and the twelfth cell is the Skip.

### Charts

All charts are hand-rolled inline SVG. No chart library: these are a handful of
bespoke plots, and the app has to work offline from first load.

**Only what the progression currency measures gets plotted.** Estimated 1RM
(Epley) for `load`, total hold seconds for `time`, and nothing at all for
`quality` and `fixed` — those get the history list and a line saying why. An
inverse load exercise charts the assistance itself rather than an estimated 1RM,
because the number on the machine going down is the progress, and it is labelled
*lower is better*.

The **knee chart** is the one that answers "is this actually getting better", so
it takes the most care:

- The 0–3 / 4–6 / 7–10 bands are shaded behind the marks. Those are status
  colours and they genuinely mean good/bad, which is the only thing status
  colours are for.
- The two series therefore wear **accent and gray, not two more hues**: the
  morning-after score is the subject and the in-session score is context. That
  is emphasis rather than a categorical pair, and it puts the morning scores
  prominently forward as the spec asks, without a colour competing with the
  bands. Validated at ΔE 18.8 (dark) and 17.2 (light) under simulated
  protanopia and deuteranopia, both well clear of the threshold, with every mark
  over 3:1 against its surface.
- Gridlines sit on the band boundaries, so the scale and the traffic light agree.
- Both series are named in a legend, so identity is never colour alone.

Bars are one hue with the numbers printed beside them: these are nominal
categories, and colouring them by value would spend the identity channel
re-encoding what bar length already shows.

**Inspection is by tap, not hover.** There is no hover on a phone, so touching a
line chart selects the nearest reading and prints it under the plot.

### What is deliberately left out

These belong to later milestones and are not oversights:

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
- `core/progression` — the four currencies, double progression, stalls, the
  inverse rule, the quality question and its two-no warning, the lever prompt and
  the deload cut. The section 12 acceptance criteria are written as tests, and
  the "never add load" rule is checked across every exercise in the real library
- `core/stats` — estimated 1RM, which series an exercise may plot, the pain
  timeline, the knee trend wording, weekly volume by muscle and adherence
- `core/scale` — axis domains on the 1-2-5 ladder, linear scaling and
  nearest-point lookup, so tick placement is tested rather than eyeballed
- `core/alternatives` — resolving and sorting alternatives, library search,
  deriving an exercise from a free-text substitute, and the substitution tallies
  behind the permanent-swap offer
- `core/pain` — the traffic-light bands, the single permitted hint, the red-band
  swap threshold, the most recent score, and when a morning check is due
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
