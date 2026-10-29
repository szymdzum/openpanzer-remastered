![Panzer Marshal Remastered](docs/banner.webp)

# Panzer Marshal Remastered

Panzer General 2, in the browser, made better without being made different.

Nicu Pavel rebuilt it for the browser as [OpenPanzer](https://github.com/nicupavel/openpanzer)
and then [Panzer Marshal](https://github.com/nicupavel/panzermarshal). This project takes
Panzer Marshal 3.2.14, its last version, and carries it forward.

## Why

**So it doesn't disappear.** Games age faster than books: formats, systems and browsers go, and
the works go with them. PG2 lives on because Nicu took it to the browser. This is the next step:
not only that it runs, but that it can keep growing. Closer to restoring an old building than to
writing a new game, and the proof that it still plays like the original is the restorer's record
of what is original and what is new.

**Out of respect for the work.** Something "in the style of PG2" from scratch would be easier.
We keep SSI's game and Nicu's port as they play, down to the dice, and only then make them
better.

**For the craft.** Tests, a deterministic engine, layers that stand apart: made properly, so that
in five years someone can open the code and see why it works.

**To learn.** A 1997 wargame holds a whole education: state, randomness, AI opponents,
interfaces, history.

**For history.** The Bzura, Mława, September 1939: a game can show why a battle went the way it
did through your own decisions, not a textbook's.

**And because it's fun.** We loved this game and want to play it, better.

## What we're doing

**Keep the spirit.** Core units you care about, scenarios that play like puzzles against the turn
limit, the joy of an overrun and the dread of a rugged defense, quick turns, rules you learn in
an hour. We don't add complexity for its own sake. [docs/RESEARCH.md](docs/RESEARCH.md) is why.

![The new campaign window: campaigns grouped by side, the briefing typed as an order, difficulty explained in one line](docs/screenshots/ui-campaigns.webp)

*Design mockup. All 17 campaigns of Panzer Marshal stay, picked from a list grouped by side,
with the starting prestige and what each difficulty changes in plain words.*

**Make it readable.** PG2 made you do the combat maths in your head. The remaster shows you the
odds before you attack and tells you why a battle went the way it did.

![The in-game HUD over the Ciechanów map: a Pz IIA about to attack a Polish 7TP, with the estimated losses on both sides](docs/screenshots/ui-hud.webp)

*Design mockup. Before attacking the 7TP the Pz IIA sees it would lose 4 strength for 1: hard
attack 3 against ground defence 7. Low fuel and ammo say so in words, not only in colour.*

**Make good on the old promises first.** Rain and snow that do nothing, leader abilities with
no effect, an AI that never defends its own flags: the manual promises things the game doesn't
do. Those come before anything new ([docs/MECHANICS.md](docs/MECHANICS.md)).

**Then fix what players always wished for**, carefully: supply lines and encirclement, units
that fight better together, a campaign that doesn't snowball or spiral. Each one is a design
discussion in the [issues](https://github.com/szymdzum/openpanzer-remastered/issues) first.

**Make it look good on today's screens.** Sharp on HiDPI, upscaled maps and units, a period
look and a soundtrack, without losing the painted-map feel.

![Six 1939 units at 2x: the original pixels above, the upscaled sprites over the upscaled map below](docs/screenshots/units-upscale.webp)

*The first test, on a HiDPI screen: today's pixels above, the remaster below. The map went
through Real-ESRGAN, the hand-drawn sprites through hqx, a pixel-art filter that keeps their
edges.*

A filter only sharpens what the old pixels hold. Past that, a unit can be rebuilt as a 3D model
and rendered into a new strip at any size, in the old strip's angles and palette
([docs/ASSETS.md](docs/ASSETS.md)).

![A Panzer IV H modelled in Blender, untextured, in the viewport](docs/screenshots/panzer-iv-model.webp)

*Work in progress: the Pz IV H, the first unit rebuilt this way, in Blender before its paint.
Its strip comes from the same scene, rendered by script through the game's camera.*

The interface becomes a 1940s war room, paper, typed orders and brass, in a light theme and a
dark one for long evenings, and gets out of the map's way.

![The equipment window in the dark theme: a Pz 38(t)A compared stat by stat with the Pz IIA it would replace](docs/screenshots/ui-equipment.webp)

*Design mockup. Upgrading the 1st Panzer: every stat of the new tank next to the old one,
and the prestige left after paying.*

**Change nothing by accident.** The game was first reconstructed from its minified build, bug
for bug. Every build of the remaster is replayed against that reconstruction, step by step:
a refactor must change nothing, and a deliberate change shows exactly what it changed.

Where we are: the code is typed, modular TypeScript on Vite. Next are the quick visible wins:
sharp HiDPI canvases, the attack preview, the move path. The whole plan is in
[ROADMAP.md](ROADMAP.md).

## Play and develop

    npm install
    npm run dev          # http://127.0.0.1:8644/, reloads on every change in src/
    npm run check        # types (tsc): noImplicitAny and the strict flags except strictNullChecks
    npm run lint         # oxlint, type-aware (.oxlintrc.json)
    npm run gate         # what CI runs: types, lint, fallow, tests with coverage
    npm run fallow       # what a change adds against main: unused code, cycles, duplicates, complexity
    npm run build        # dist/: the bundled game with its assets; npm run preview serves it
    npm run -s play -- help  # a scenario played from the terminal against the AI (docs/CLI.md)
    npm run play:live    # the dev server with the terminal's bridge: the game's page plays the calls, animated

- `src/` the game as TypeScript ES modules, `src/main.ts` is the entry; `src/view/` the UI
  (Preact), `src/core/` the rules
- `game/` the 3.2.14 build's assets (the page has `<base href="/game/">`), images, sounds and
  manuals in Git LFS (`git lfs install` before cloning); the old UI's stylesheet, fonts and
  images went with it (#351)
- `harness/` the comparison with the reference, `docs/TYPES.md` the typing rules,
  `docs/MECHANICS.md` how the game plays (rules, combat, AI), `docs/RESEARCH.md` what PG2 and
  other WW2 strategy games teach about design, `docs/ASSETS.md` research on new unit and map
  graphics, `docs/design/` the old UI that the new one replaced, `docs/ui/` the UI's design

Vite blanks the types out with ts-blank-space instead of compiling: the browser runs src/ line
for line and column for column (only the import paths change), so coverage and stack traces
point at the source. The new UI's components (`src/view/**/*.tsx`, Preact) are the exception: Vite
compiles their JSX, with source maps.

## Verification

Every change is compared with a reference in headless Chrome, step by step: the game's state before
every AI action, at every turn's end and after a save and its load. The reference is the original game (`reference/`: the 3.2.14 source
reconstructed from its bundle, on the same assets, served on 8643), or with `BASELINE_REF=<git
ref>` this repo at that commit on its own Vite. The remaster runs on the Vite dev server (8644);
the scripts start the servers when they're not running.

    npm run verify               # harness/replay.sh: 16 scenarios, campaigns and the tutorial played AI vs AI
    BASELINE_REF=origin/main npm run verify   # against main: what a pull request changes

Pull requests run verify on GitHub Actions against their base branch (`.github/workflows/
verify.yml`): main differs from the original on purpose, so against main a refactor comes out
identical and a deliberate change shows only itself. There main's own traces are played into the cache
after each push to main, and the label `behavior-change` is judged without playing again. The page's
DOM and canvases aren't compared since the UI that draws them was replaced (#351): the UI has its own
test, below.

Every item plays in its own Chrome, several at once (JOBS, default 3/4 of the cores). The reference's traces are cached per item in harness/out/baseline, until the reference
or the harness changes. A step that waits for loads until the timeout is reported: it usually
means a stuck request.

A refactor must leave it identical. A deliberate change shows exactly what it changed.

The UI has its own end-to-end test: one short campaign game played in headless Chrome on the dev
server through the page's element ids and keys, as a person plays it. The start menu, a new campaign,
a unit bought and deployed, a move, the unit list and the unit card, the AI's turns, an attack, the
dossier, a save to a file and its load back (the same game after it), the scenario's end and the
campaign's next scenario. Any error in the page fails it; the random streams are seeded, so it plays
the same game every time (`test/e2e/game.ts`, about a minute; CI runs it on every pull request).

    npm run e2e                  # CHROME=<path> for another Chrome than the installed one

The contract tests check the engine in seconds, without a browser: Vitest restores 13 game
states recorded on the reference and replays the reference's calls on them.

    npm test                     # 2 contracts on 15 states and the engine tests
    npm run test:coverage        # the same, with what they run of the engine (coverage/)
    npm run record <module>      # record a contract again on the reference

- `gamerules`: every rule (movement, combat, supply, experience) on every unit and unit pair, asked
  of the game's GameRules on the core
- `engine`: the AI plays every player for 2 turns through the game's commands and its session on
  the core, with random player actions of every kind mixed in (embarking and undo included), a
  hash of the whole state after each step; then the saved game, the combat log and the equipment
  data. Its results are the remaster's since the AI draws from its own stream (#126) and since the
  game runs on the core (#137: the spotting and zone of control follow the units, #72, #73); on the
  reference the same driver plays the old engine's functions
- (`unit`, every Unit method, went with the old engine's Unit in #137: the core's units are plain
  state, their rules played through the commands)

A bug fixed on purpose changes a contract, and the reference still has the bug: `UPDATE_CONTRACTS=1
npm test` writes the remaster's results into the fixtures (the recorded states stay). Do it only in
the commit that fixes the issue, and say in it what changed; a refactor never re-records.

GitHub Actions runs the types, the linter, fallow, typos and the tests with coverage on every pull request
and on main (`.github/workflows/ci.yml`); main takes changes only through a pull request with that
check green. Each engine file has a coverage floor (`thresholds` in `vite.config.mts`): a change may
raise it, not lower it.
Mutation testing checks the tests themselves: Stryker changes the engine one small thing at a
time and expects a contract to fail every time. It takes hours for the whole engine, so CI runs
it every Sunday and on demand, one runner per module, the reports as the run's artifacts
(`mutation.yml`). Locally, one module at a time: `MUTATE=map npm run test:mutation`.

## Credits

Panzer General 2 by SSI. OpenPanzer and Panzer Marshal, code and assets, by Nicu Pavel and
contributors. The remaster builds on their work.
