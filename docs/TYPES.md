# Typing the modules (ROADMAP 2b)

Goal: real types on the reconstructed code, **without changing what it does**. The harness
proves it: the replays stay identical to the original (`reference/`).

## Checks

- `npm run check`: tsc on the game and the tests, 0 errors. `tsconfig.json` has `noImplicitAny`,
  the unused-name, implicit-return and switch-fallthrough checks and `strictFunctionTypes`;
  `strict` stays off until `strictNullChecks` gets its own pass.
- `harness/replay.sh`: all 16 items identical.
- `npm run e2e`: the UI's end-to-end test (the old UI's 24 scripts of user steps, `harness/ui-replay.sh`,
  went with it in #351).

The harness runs the Vite dev server of the checkout it's started in. Parallel work on several
modules: a git worktree each, with its own `PORT` and `BDG_SESSION`.

## Rules

1. **Types only, the runtime code stays.** No `var` to `let`/`const` (scoping and hoisting
   differ), no arrow functions for `function` (different `this`), no reordering, no "fixes".
   Comments stay. The bugs the reconstruction documented stay; fixing them is a later step.
2. **Erasable syntax only** (Vite blanks types out, `erasableSyntaxOnly` is on): no `enum`,
   no `namespace` with values, no parameter properties, no `import =`. Imports of names used
   only as types are `import type` (or `type` in the braces), `verbatimModuleSyntax` is on.
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
   - A class is not hoisted like a function: check no code at load time uses it before its
     module ran (see the load order in `src/main.ts`).
4. **Module objects** (`var GameRules = (function(GameRules) {...})(GameRules || {})`) get an
   interface describing their API; type the parameter and the var with it.
5. **Modules**: a name is declared and exported by one module, the others import it. A module
   can't assign another module's variable: the owner exports a setter (`setMovTable`).
   `types/data.d.ts` (equipment entries, scenario and campaign lists, loaded by classic scripts)
   and `types/globals.d.ts` (platform APIs) are the only globals.
6. Use these names for the core types, whether or not their module is typed yet: `Cell`,
   `extendedCell`, `pathCell`, `Supply`, `combatResults`, `movementResults`, `Unit`,
   `Transport`, `Player`, `Hex`, `GameMap` (the game's Map, renamed so it no longer shadows the
   built-in), `Scenario`, `Campaign`, `Game`, `AI`, `EquipmentEntry`, `Render`, `UI`.
7. Other agents type other modules at the same time. Only edit your own files.
