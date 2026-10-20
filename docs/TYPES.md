# Typing the modules (ROADMAP 2b)

Goal: real types on the reconstructed code, **without changing what it does**. The harness
proves it: the replays stay identical to openpanzer-src.

## Checks

- `npm run check`: tsc with the base config. Your files: 0 errors.
- `npm run check:strict`: the same with `noImplicitAny`, the typing measure. Your files: 0 errors,
  or a short list of what is left and why.
- `MINE=<your modules> BDG_SESSION=<your key> harness/replay.sh`: all 16 items identical.
- `MINE=<your modules> BDG_SESSION=<your key> harness/ui-replay.sh <scripts...>`: the UI scripts
  that exercise your modules (see `harness/ui/`; all of them for UI modules), all steps identical.

`MINE` builds your modules from the working tree and every other module from the last commit,
into `dist-<session>/`, so other agents' unfinished edits don't break your runs. Filter tsc output
to your files: `npm run check 2>&1 | grep '^src/<module>\.ts'`.

## Rules

1. **Types only, the runtime code stays.** No `var` to `let`/`const` (scoping and hoisting
   differ), no arrow functions for `function` (different `this`), no reordering, no "fixes".
   Comments stay. The bugs the reconstruction documented stay; fixing them is a later step.
2. **Erasable syntax only** (the build blanks types out, `erasableSyntaxOnly` is on): no `enum`,
   no `namespace` with values, no parameter properties, no `import =`.
3. **Constructor functions** may become classes, carefully:
   - Keep the name (other code and the harness use it).
   - Methods assigned as `X.prototype.m = function` stay assigned that way, typed through an
     interface merged with the class (`interface Hex { copy(h: Hex): void }`): class methods are
     not enumerable, and the game does `for (var p in hex)` over instances (gamestate export).
   - Constructors with private closure state and `this.m = function` methods keep their body as
     the class constructor, the methods typed as `declare m: (...) => T` fields (`declare`
     emits nothing; a plain field would be initialized and change behavior).
   - Patterns a class can't express (`X.call(this, ...)`, `Y.prototype = new X()`) can stay
     functions typed with an interface, or become `extends` if the harness shows no difference.
   - A class is not hoisted like a function: check no code at load time uses it before its file ran.
4. **Module objects** (`var GameRules = (function(GameRules) {...})(GameRules || {})`) get an
   interface describing their API; type the parameter and the var with it.
5. **Shared types**: `types/data.d.ts` (equipment entries, scenario and campaign lists) and
   `types/globals.d.ts` (implicit globals, platform APIs) belong to the coordinator: don't edit
   them, ask in your report. Types of your own module live in your own file.
6. Use these names for the core types, whether or not their module is typed yet: `Cell`,
   `extendedCell`, `pathCell`, `Supply`, `combatResults`, `movementResults`, `Unit`,
   `Transport`, `Player`, `Hex`, `GameMap` (the game's Map, renamed so it no longer shadows the
   built-in), `Scenario`, `Campaign`, `Game`, `AI`, `EquipmentEntry`, `Render`, `UI`.
7. Other agents type other modules at the same time. Only edit your own files.
