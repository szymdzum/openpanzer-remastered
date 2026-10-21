# openpanzer-remastered

A remaster of Panzer Marshal 3.2.14 (the HTML5 Panzer General 2 by Nicu Pavel), built on the
faithful source reconstruction in [openpanzer-src](../openpanzer-src). See ROADMAP.md.

## Play and develop

    npm install
    npm run dev          # http://127.0.0.1:8644/, reloads on every change in src/
    npm run check        # types (tsc); check:strict with noImplicitAny
    npm run build        # dist/: the bundled game with its assets; npm run preview serves it

- `src/` the game as TypeScript ES modules, `src/main.ts` is the entry
- `game/` the 3.2.14 build with all the assets (the page has `<base href="/game/">`), images,
  sounds and manuals in Git LFS (`git lfs install` before cloning)
- `harness/` the comparison with the reference, `docs/TYPES.md` the typing rules,
  `docs/MECHANICS.md` how the game plays (rules, combat, AI), `docs/RESEARCH.md` what PG2 and
  other WW2 strategy games teach about design, `docs/design/` the current UI

Vite blanks the types out with ts-blank-space instead of compiling: the browser runs src/ line
for line and column for column (only the import paths change), so coverage and stack traces
point at the source.

## Verification

Every change is compared with openpanzer-src (served on 8643) in headless Chrome, step by step:
game state, DOM and canvas pixels. The remaster runs on the Vite dev server (8644), the scripts
start both servers when they're not running.

    npm run verify               # both below, about 3 minutes
    harness/replay.sh            # 16 scenarios, campaigns and the tutorial played AI vs AI
    harness/ui-replay.sh         # 24 scripts of user steps (harness/ui/), or some of them

Every item and script plays in its own Chrome, several at once (JOBS, default 3/4 of the
cores). The reference's traces are cached per item in harness/out/baseline, until openpanzer-src
or the harness changes. A step that waits for loads until the timeout is reported: it usually
means a stuck request.

A refactor must leave both identical. A deliberate change shows exactly what it changed.
