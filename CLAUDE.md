# Working on openpanzer-remastered

A TypeScript remaster of Panzer Marshal 3.2.14 (an HTML5 Panzer General 2). The reference is
the original game, reconstructed in `reference/`: the harness and the contract tests compare this
repo with it. Read README "Play and develop" and "Verification" first; docs/REFACTOR.md says how the
engine is laid out after the refactor, docs/TYPES.md the typing rules, docs/MECHANICS.md how the
game plays.

## Setup

- Node from `.nvmrc`: after `cd` into the repo, `export PATH="$(nvmrc-bin):$PATH"` before npm.
  On the wrong Node, Vitest hangs.
- The tests' time zone is Europe/Warsaw (the contracts were recorded in it); npm scripts and CI
  set it.

## Checks

| Command | Time | When |
|---|---|---|
| `npm run check`, `npm run lint` | seconds | after every edit (the hooks in `.claude/settings.json` lint each edited file and check the types when you stop) |
| `npm run gate` | 1-2 min | before every commit: what CI runs (types, lint, fallow audit, tests with coverage); `typos` too if installed (`brew install typos-cli`) |
| `npm test` (`npm run test:coverage` in CI, with per-file coverage floors) | ~40 s | after every small step |
| `npm run e2e` | ~1 min, one Chrome | the UI's end-to-end test (test/e2e/game.ts); CI runs it on every pull request (`ci.yml` e2e) |
| `npm run verify` | 3-4 min, up to 6 Chromes | on GitHub: a required check on every pull request, run against its base branch when it touches `src/`, `harness/` or `game/` (`verify.yml`: the AI games' replay, a few minutes; adding the label judges without playing again). Locally only to debug a difference |

Locally, compare with main: `BASELINE_REF=origin/main npm run verify`. One verify at a time on
the machine (the laptop overheats): take the lock first, `until mkdir /tmp/openpanzer-chrome.lock 2>/dev/null; do sleep 15; done`, remove it
after (use a trap); `JOBS=3`. The same goes for `test/contracts/record.sh`. Redirect their output
to a file: piping them into `tail` or `head` hangs (the background server keeps the pipe open).
Against the original (no BASELINE_REF), main is not "all identical": it differs on purpose.

## Rules

- **A refactor changes no behavior and re-records nothing.** The contracts (`npm test`) and
  verify stay the same. If they change, the behavior changed: find out why.
- **A bug found is a GitHub issue** (label `bug`, plus `ai` when it's the AI), with file:line
  evidence; check `gh issue list --state all` first. It is not fixed on the side.
- **A deliberate fix** is its own commit naming the issue; it re-records the contracts with
  `UPDATE_CONTRACTS=1 npm test` and says what changed. Never run UPDATE_CONTRACTS otherwise.
- **Tests say what is right.** The contracts pin the original, bugs included, and a red contract
  only says a result changed. So every deliberate fix comes with a unit test named after the
  correct behavior and the issue (test/undo.test.ts for #68), checked to fail without the fix; new
  mechanics are written test-first, small rule tests on a hand-built map (`smallGame()` in
  test/headless.test.ts).
- **Kept bugs are kept**: many are pinned by `test.fails` tests named after their issue. A fix
  flips its test.
- The order of the draws within each random stream (`src/core/random.ts`) is behavior: the game stream
  (`Rng.random`: the dice, the leaders, the prototypes), the AI's (`Rng.aiRandom`: its purchases
  and scores) and the cosmetic stream (`Rng.cosmeticRandom`: the UI's sprite and sound picks).
  Never draw from another stream's: the AI and the UI don't move the dice.
- The harness reaches into the game: `?harness` exposes every module's exports as globals and
  patches module objects (`GameRules`, `Leaders`...), `harness/lib/harness.js` snapshots the game
  at every step through `toData` (`src/state.ts`, docs/STATE.md), or by walking the objects' own
  data properties against a baseline without it (the original game). Renaming an export the
  harness uses shows up there. `test/harness-surface.test.ts` lists the
  names the harness uses.
- Erasable TypeScript only (no enum, namespace values, parameter properties). Key order of data
  fields is part of the saved game. Classes aren't hoisted: mind the load order in `src/main.ts`.

## Style

- Opening braces on the same line (`function f() {`, `} else {`). Tabs.
- Engine modules (the core in `src/core/`, `commands`, `mirror`, `gamerules`, `map` and its parts,
  `unit`, `ai`, `scenario`...) don't import the UI (`src/view/`), the page's modules (`app/page`, `main`)
  or `app/game`: they read the game through `src/context.ts`. The game plays on the core (docs/CORE.md)
  and shows itself through the screen interface (`src/app/screen.ts`), which the UI implements
  (`src/view/screen.tsx`); the objects (GameMap, Unit, Player) mirror its state for the harness, the
  contracts and their own code (src/mirror.ts). The UI reads only the core, `src/app/` (the host, the screen interface, the settings). The linter and `test/headless.test.ts` check it.
- `src/` has no unused code and no import cycles; CI runs `fallow dead-code` on the whole tree.
  Keep it that way: the modules that read the running game do it through `src/app/running.ts`, not
  `app/game.ts`.
- `npm run fallow` (fallow audit against main) fails on what a change adds: an unused file, a new
  import cycle (they decide the load order), duplicated code, an overly complex function. Inherited
  findings don't count; `npm run fallow:report` shows them all.
- `git commit` runs lefthook (`lefthook.yml`): types, lint and typos on the staged files.
- The linter (`.oxlintrc.json`) runs every rule as an error; its `overrides` list the old files
  exempt from a rule. New files get every rule; don't add a file to an exemption list, and take a
  file off a list once it's clean.

### Comments

- **On an export** (function, type, class): a `/** */` TSDoc block, one sentence on what it does or
  returns. Add a why paragraph only when the code can't show it. `@param` and `@returns` only when the
  type and the name leave a parameter unclear.
- **Inside a function**: `//` only for why: a rule of the game that isn't obvious, a kept bug, the
  order of random draws, a parity trap with the original.
- **File header**: 1-3 lines saying what the module is (the folder says the layer), then the license.
  Nicu Pavel's copyright stays on the files reconstructed from the original.
- **Issue numbers** only where they explain why the code is like this now: `Kept bug (#20)`,
  `Deliberate (#68)`, `docs/STATE.md D5`.
- **Not in comments**: history ("used to", "the old X went in #n", "since #n": that is `git log`),
  anything that repeats the name or the type, anything no longer true.
- **Prefer code over prose**: a named type, a named constant, a smaller function.

```ts
// Before: the shape in the signature, a paragraph for the body
//Map.moveUnit: unit id to the hex along the cheapest path in cells (...), stops before a hidden enemy ...
export function moveUnit(d: Draft, id: UnitId, to: Position, cells: readonly { row: number; col: number; cost: number }[] | null,
	retreat = false): MoveOutcome {

// After: a named type, two sentences
type MoveCells = readonly { row: number; col: number; cost: number }[];

/**
 * Moves a unit along the cheapest path through `cells` (its move range when null) and stops it before
 * a hidden enemy. A human's move can be undone when it spotted nothing new and wasn't surprised;
 * a retreat never can.
 */
export function moveUnit(d: Draft, id: UnitId, to: Position, cells: MoveCells | null, retreat = false): MoveOutcome {
```

## Git

- main takes changes only through a pull request with the checks `test` and `verify` green;
  rebase merge. A branch per piece of work. A difference in verify fails it: a refactor must
  come out identical; a deliberate change passes once the owner has read its differences and
  added the label `behavior-change` (Claude may add it when the differences are exactly the
  ones the change intends, and says so in the pull request). The run the label accepts records
  the fingerprint of its differences in a comment; after a new push the label stays only if verify
  finds the same fingerprint (a rebase that changed nothing it accepted). Otherwise verify takes
  it off: read the new run's differences before adding it again.
- Work fast locally, let CI do the heavy checks: the hooks and `npm test` before a commit, then
  push the branch and open the pull request right away (no need to ask), with
  `gh pr merge --auto --rebase` so it merges itself once the required checks are green. Keep
  working on the next branch meanwhile. Run verify locally only to debug a difference CI showed.
- Commit messages: an imperative subject, a short plain-English body saying what changed and
  what verify showed. No AI attribution, no Co-Authored-By.
- Parallel agents: a git worktree each, outside the repo (`../openpanzer-wt/<name>`), with
  `node_modules` symlinked from the main checkout (stage files by path, never `git add -A`; remove
  only the symlink when cleaning up), and their own `PORT`, `REFERENCE_PORT` and `BDG_SESSION` for verify.
  No `git stash`: the stash list is shared by every worktree; commit work in progress on your branch. Other agents may be working in the repo at the same time:
  only touch your own files.
