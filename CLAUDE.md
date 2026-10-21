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
| `npm test` (`npm run test:coverage` in CI, with per-file coverage floors) | ~9 s | after every small step |
| `npm run verify` | 3-4 min, up to 6 Chromes | on GitHub: every pull request that touches `src/`, `harness/` or `game/` runs it against its base branch (`verify.yml`). Locally only to debug a difference |

Locally, compare with main: `BASELINE_REF=origin/main npm run verify`. One verify at a time on
the machine (the laptop overheats): take the lock first, `until mkdir /tmp/openpanzer-chrome.lock 2>/dev/null; do sleep 15; done`, remove it
after (use a trap); `JOBS=3`. The same goes for `test/contracts/record.sh`. Redirect their output
to a file: piping them into `tail` or `head` hangs (the background server keeps the pipe open).
Against the original (no BASELINE_REF), main is not "all identical": the unit markers differ in
canvas pixels on purpose.

## Rules

- **A refactor changes no behavior and re-records nothing.** The contracts (`npm test`) and
  verify stay the same. If they change, the behavior changed: find out why.
- **A bug found is a GitHub issue** (label `bug`, plus `ai` when it's the AI), with file:line
  evidence; check `gh issue list --state all` first. It is not fixed on the side.
- **A deliberate fix** is its own commit naming the issue; it re-records the contracts with
  `UPDATE_CONTRACTS=1 npm test` and says what changed. Never run UPDATE_CONTRACTS otherwise.
- **Kept bugs are kept**: many are pinned by `test.fails` tests named after their issue. A fix
  flips its test.
- The order of `Math.random` draws is behavior: the UI's sprite and sound picks share the stream
  with the dice and the AI.
- The harness reaches into the game: `?harness` exposes every module's exports as globals and
  patches module objects (`GameRules`, `Leaders`...), `harness/lib/harness.js` snapshots the own
  data properties of game objects at every step. Renaming an export, adding a data field to a
  game object or a class name change shows up there. `test/harness-surface.test.ts` lists the
  names the harness uses.
- Erasable TypeScript only (no enum, namespace values, parameter properties). Key order of data
  fields is part of the saved game. Classes aren't hoisted: mind the load order in `src/main.ts`.

## Style

- Opening braces on the same line (`function f() {`, `} else {`). Tabs. Comments say why, in
  plain English, like the surrounding ones.
- Engine modules (`actions`, `gamerules`, `map` and its parts, `unit`, `ai`, `scenario`...) don't
  import UI modules (`ui`, `uibuilder`, `render`, `animation`, `dom`) or `game`: they read the
  game through `src/context.ts`. The linter and `test/headless.test.ts` check it.
- `npm run fallow` (fallow audit against main) fails on what a change adds: an unused file, a new
  import cycle (they decide the load order), duplicated code, an overly complex function. Inherited
  findings don't count; `npm run fallow:report` shows them all.
- `git commit` runs lefthook (`lefthook.yml`): types, lint and typos on the staged files.
- The linter (`.oxlintrc.json`) runs every rule as an error; its `overrides` list the old files
  exempt from a rule. New files get every rule; don't add a file to an exemption list, and take a
  file off a list once it's clean.

## Git

- main takes changes only through a pull request with the CI check `test` green; rebase merge.
  A branch per piece of work.
- Work fast locally, let CI do the heavy checks: the hooks and `npm test` before a commit, then
  push the branch and open the pull request right away (no need to ask), with
  `gh pr merge --auto --rebase` so it merges itself once the required checks are green. Keep
  working on the next branch meanwhile. Read the Verify job's summary before relying on a merge
  that touches `src/` until Verify is a required check. Run verify locally only to debug a
  difference CI showed.
- Commit messages: an imperative subject, a short plain-English body saying what changed and
  what verify showed. No AI attribution, no Co-Authored-By.
- Parallel agents: a git worktree each, outside the repo (`../openpanzer-wt/<name>`), with
  `node_modules` symlinked from the main checkout (stage files by path, never `git add -A`; remove
  only the symlink when cleaning up), and their own `PORT`, `REFERENCE_PORT` and `BDG_SESSION` for verify. Other agents may be working in the repo at the same time:
  only touch your own files.
