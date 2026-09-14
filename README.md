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
| `load`    | Add weight, via double progression          | Split squat, incline bench  |
| `quality` | Never add weight — speed, height, intent    | Skater jump, med ball slam  |
| `time`    | Hold longer, or progress the lever          | Spanish squat, Copenhagen   |
| `fixed`   | Nothing goes up                             | Warm-ups, agility ladder    |

A `load` exercise is not always loaded in kilograms. The inverted row gets harder
by elevating the feet and the banded pull-up by moving to a thinner band; both
track reps only, carry no `incrementKg`, and are told to "add a step" with the
rule's own label rather than offered a weight.

## Stack

- **React 18 + TypeScript + Vite** — a handful of bespoke screens, no component library
- **Dexie (IndexedDB)** — history grows unbounded; `localStorage` is a synchronous 5 MB cliff
- **Zustand** for state, **CSS Modules** with custom properties for styling
- **Black and purple/burgundy** in dark mode, which is the default. Purple is the
  foreground half — accent, chips, chart lines — because on a near-black ground a
  colour has to be light to be read as text; burgundy is the deep half, used for
  rails and fills and never asked to be text. Contrast is checked, not eyeballed:
  text clears 16:1 on every surface, the accent 6:1, and the rail 3:1.
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
the app works served from a domain root or from a project-pages subpath. A
service worker needs HTTPS (or localhost), which all three provide.

`vercel.json` sets cache headers: the service worker, the manifest and the page
itself are revalidated on every load, because none of them carries a content
hash and a stale `sw.js` means a new deploy never reaches an installed app.
Everything under `/assets` is hashed by the build and cached for a year.

### On an iPhone

Open the deployed URL in **Safari** — not Chrome, which cannot install a PWA on
iOS — then Share → Add to Home Screen. It then launches without browser chrome
and works in aeroplane mode.

iOS evicts a web app's storage after roughly seven weeks without use, so the
export in Settings is the thing that makes a long training history safe. That is
what the 30-day backup nudge is for.

The alert behaviour on iOS has its own section at the end of this file. Read it
before wondering why a rest did not beep.

## Project layout

```
src/
  core/       Pure, unit-tested logic — no React, no IndexedDB
  db/         Dexie schema, the seed loader and typed accessors
  types/      The data model (section 4 of the requirements) as actual types
  data/       seed-programme.json — the library, the four days and the pull-up ladder
  state/      Zustand store; a cache over IndexedDB, never the source of truth
  screens/    Screen components
  components/ Shared UI primitives
```

`docs/REQUIREMENTS.md` is the specification this is built against.

## The seed data

`src/data/seed-programme.json` is the source of truth for programme content: 64
exercises, four days — three full-body gym sessions and one mobility day at home
— and the four-stage pull-up ladder. It is loaded into IndexedDB on first run and
is not re-read afterwards, so the user can edit the programme in place without an
app update overwriting them. A newer `schemaVersion` refreshes the seeded library
and programme while leaving user-added exercises, settings and all logged history
untouched — which is how the three-day split reached installs already running the
four-day one. The one thing a refresh does overwrite is a substitution made
permanent, since that edit lives in the stored programme. **Any change to seed
content needs the `schemaVersion` bumped**, or `seedIfNeeded` is a no-op on every
existing install.

Two kinds of exercise are in the library but in no day's blocks, and they are not
the same kind:

- The 12 marked **`phase1Excluded`** are held back by the knee and come back on a
  schedule. They appear under **Deferred** with their reintroduction week.
- The 3 marked **`userExcluded`** were dropped at the user's request — the trap
  bar deadlift, the hip thrust and the Nordic curl — and are not coming back on
  any schedule. They appear under **Deferred → Removed** with the reason given,
  because a decision with no reason recorded is one nobody remembers making. They
  stay in the library: logged history points at them, and any of them can still
  be swapped in mid-workout.

Both rules are enforced by `validateSeed`, which runs before anything is written —
a seed that puts a jump back into the knee-adapted phase fails to load rather
than loading quietly.

## Build status

The build order follows section 13 of the requirements, each milestone shipped
working before the next is started.

- [x] **1. Data layer** — types, IndexedDB schema, seed loader, and a read-only
      Programme screen that renders every day and the reintroduction schedule
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
- [x] **8. Export/import, settings, polish** — the settings screen, working
      kilogram/pound display, a JSON backup and restore, CSV set history, and the
      30-day backup nudge

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
- **Notifications are Android-only.** Android refuses the bare `Notification`
  constructor and only accepts `ServiceWorkerRegistration.showNotification`; the
  constructor stays as the desktop fallback. On iOS the whole path is switched
  off — see the iOS section below for why.
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
  "Rest finished 1:12 ago" instead of silently resetting — and offers **Rest
  again** or **Log next set**, because on iOS that alert can arrive minutes late
  and "it finished a while back" is not an instruction.
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

- **The trap bar deadlift runs 6-8.** The seed twice arrived prescribing a fixed
  4×5 with `repRange [5, 5]`, which cannot satisfy acceptance criterion 8 —
  after 4×8 all clean, suggest the next weight up at 6 reps. The rule says 6-8
  and steps in 2.5 kg, so the criterion holds against the seeded lift itself:
  4×8 clean at 80 kg earns 82.5 kg, and the rows reopen at 6. The lift is
  `userExcluded` now and so is not in any day, but the rule has to be right for
  the session it is swapped back into.
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

### The pull-up ladder

The user is working toward a first unassisted pull-up, which is a staged
progression rather than one exercise that gets heavier. The seed carries four
rungs — each with its exercises, its prescriptions and a plain-English **gate** —
and settings carry which rung they are on.

**What counts as a pull-up slot.** The seed marks none, so the rule is that any
prescription naming an exercise the ladder can prescribe *is* one. Both gym days
carry exactly one.

**How a stage fills them.** Stages hold between one and three prescriptions and
the programme holds two slots, so neither "all of them in every slot" nor "one
each" works. They are dealt round-robin: stage 1's three still all get run across
the week, and stage 4's single *attempt pull-ups* entry appears in both days
rather than dropping out of one. The slot keeps how the work is run — rest, per
side — and the stage brings what the work is: exercise, sets, reps or hold.

**Advancing is a button, never a calculation.** "A controlled 8-second negative"
is a judgement made at the bar; inferring it from logged reps would move the user
up on a set that felt nothing like one. The card shows the stage, its gate and
**I've met the gate**, with one confirmation because it changes what the next
session prescribes. Settings carry a stage picker too, since the only other way
back *down* a rung would be to meet three gates.

**Attempts are two flags, not one.** Stages 3 and 4 open with one unassisted rep,
fresh, before anything else. Whether it was attempted is the habit the Progress
streak counts; whether it went up is the milestone. A miss keeps the streak —
missing is the expected outcome right up until it is not — and the first success
gets a dated line of its own on Progress.

A swap on a ladder slot is never offered as permanent: the stored programme does
not name those exercises, so rewriting it would find nothing and silently do
nothing.

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

### Settings, units and backups

Every setting is live — nothing is stored and ignored. Alongside theme, units,
plate increment, auto-start, sound and vibration there are now **alert volume**,
**keep screen on during workouts** (on by default; see the iOS section), **try to
play alerts in the background** (off by default) and the **pull-up ladder stage**.

A settings row written by an older version is read back spread over the current
defaults, so a field added by an update is never `undefined` on an existing
install — an `alertVolume` that arrived as `undefined` would reach the gain node
as `NaN` and silence every alert.

**Weights are kilograms everywhere inside the app** — the seed is in kilograms,
`weightKg` is in kilograms, and every calculation stays there. Conversion happens
only at the boundary: on the way to a screen, and on the way back from an input.
Set rows, progression banners, summaries, history and the strength charts all
follow the setting.

One consequence worth knowing: in pounds the step is the kilogram plate
increment converted, so 2.5 kg reads as 5.5 lb rather than a round 5 lb. That is
deliberate — the plates are kilograms, and stepping by round pounds would drift
the stored weight onto numbers no gym actually has.

#### Export and import

There is no server, so an export is the user's only backup and it has to be
trustworthy.

- **Export** writes one JSON file — every session, morning check, setting, custom
  exercise, the programme as edited, and the bookkeeping that cannot be
  regenerated, above all the programme start date that every week number depends
  on. Filename `trainer-export-YYYY-MM-DD.json`.
- **Import** validates before it writes anything: a file from another app, or
  from a newer schema than this build understands, is refused rather than
  half-applied. The change is then planned and shown as a summary — sessions
  added, updated, unchanged, and on a replace, how many will be deleted — and
  only written once confirmed, in a single transaction.
- **Merge resolves an id collision by recency.** There is no modified timestamp
  in the data model, so recency is the latest moment a session can be shown to
  have been touched: its finish, its start, or its last completed set. A session
  that gained sets after being exported therefore beats the exported copy.
- **Merge leaves this device's settings and programme alone.** Merging history is
  not the same as adopting another device's preferences; only a replace takes
  those.
- **CSV** gives one row per logged set for a spreadsheet, in kilograms
  regardless of the display setting — an export should not depend on a
  preference.
- The Today screen nudges for a backup once it has been more than 30 days, or
  more than 30 days since the first session if there has never been one.
  Dismissible, and it stays dismissed until the next export.

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
- `core/ladder` — stage clamping and gates, the round-robin deal, slot resolution
  against the real seed at every stage (acceptance criterion 17), and the attempt
  streak including what does and does not break it
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
- **Wake Lock** is held for the whole session while `keepScreenAwake` is set, and
  re-requested on every return to visibility, since the browser drops it whenever
  the page is hidden. It defaults **on**.
- **Notifications** are a supplementary alert on Android only. Permission is
  never requested on first launch: it is offered once, inline, after a rest has
  actually elapsed while the app was backgrounded.

## iOS is the hard case, and it was designed for first

**iOS does not let a web app alert you while the screen is locked.** When Safari
backgrounds or the screen locks, JavaScript timers are suspended and audio
playback stops. That is an operating-system restriction, not something to code
around, so the app is built to be *seen and heard while the screen is on* and to
degrade honestly when it is not.

1. **The wake lock is the actual fix, and it defaults on.** An hour of screen-on
   battery is the trade for a timer that works. It is surfaced as "Keep screen on
   during workouts", not as a technical setting.
2. **Audio is unlocked on the first gesture of the session** — the tap on Start —
   and `audioContext.resume()` runs on every `visibilitychange` back to visible.
   iOS suspends a backgrounded context, and a suspended context plays nothing, so
   without that the alert goes silent for the rest of the session the first time
   the phone goes in a pocket.
3. **The alert is loud enough to matter.** A two-tone figure repeated three times
   over about two seconds at the set volume, plus a full-screen colour pulse that
   runs alongside it. One short beep is easy to miss with headphones in and the
   phone face-down on a bench.
4. **It computes on resume and says what happened.** Coming back after the timer
   elapsed fires the alert and shows "Rest finished 1:12 ago", with **Rest again**
   and **Log next set**. That is what turns the limitation from "the app is
   broken" into "the app knew".
5. **The silent-audio keep-alive is optional and off.** A looping silent element
   keeps the audio session alive while Safari is backgrounded *with the screen
   still on*, which is enough for the alert to fire. It does not survive a locked
   screen and it costs battery, so it is a setting labelled for exactly what it
   buys.
6. **There is no notification path on iOS.** Web Push there needs the app
   installed to the home screen *and* a push server this app does not have, and
   there is no way to schedule a future local notification from a web app. A
   notification path would be a promise the app could not keep.
7. **The app says all of this, once.** First run on an iPhone shows a card
   explaining the wake lock and the locked-screen case, and never shows it again.

**Accepted limitation:** with the screen manually locked, no alert will sound on
iOS. The honest workarounds are a native app or an Apple Watch, both out of
scope. Everything above exists to make the locked-screen case rare rather than to
defeat it.
