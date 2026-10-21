# Roadmap

The remaster starts as a copy of the faithful reconstruction ([openpanzer-src](../openpanzer-src))
and changes it on purpose, one step at a time. The harness compares every build with that
reference: a refactor must leave the replays identical, a deliberate change shows exactly what
it changed (and the reference traces of that step are then the new expected behavior).

## 1. Reference point ✅

- [x] Faithful reconstruction of all 21 modules in openpanzer-src, verified against the bundle
- [x] This repo, with the harness comparing against openpanzer-src

## 2. TypeScript, then Vite

- [x] 2a. Modules become .ts files, type checked by tsc 7, types blanked out by the build:
      still global scripts, no behavior change (replays identical)
- [x] 2b. Real types everywhere: tsc and noImplicitAny clean (from 365 and 1491 errors), the
      model as classes, replays identical
- [x] 2b+. The local stand-in interfaces modules declared for each other's types replaced by
      the real ones (imports made them visible)
- [x] 2c. ES modules instead of globals, Vite dev server with reload on change, production
      build; the implicit globals became module variables; the harness runs the dev server
- [ ] 2d. Constructor functions to classes where the load order allows it, which removes the
      `new (X as unknown as XConstructor)` casts

## 3. Quick visible wins

- [ ] Sharp canvases on HiDPI/Retina screens (devicePixelRatio)
- [ ] Combat odds preview before an attack (the engine already estimates the result)
- [ ] Move path preview

## 4. Fixes to the original

One change at a time, with the replay difference as its evidence. Candidates from the
reconstruction notes, to check against the PG2 rules (Luis Guzman's PG2 file specs):

- [ ] Ships resupply and reinforce only outside ports (inverted check)
- [ ] Unit.reinforce sets `hasRessuplied` (typo), so a unit can reinforce and resupply in one turn
- [ ] AI spends prestige twice (reinforcement budget set before purchases)
- [ ] AI permanently prunes the shared equipment lists when buying
- [ ] Mud movement table: towed cost 21 for Fortification
- [ ] Combat log scenario info button hides the log
- [ ] "No Ammo" and "No Fuel" tooltips share an id
- [ ] Unit info writes gunrange 1 into the equipment data
- [ ] Cloud saves on GitHub gists: off until the game has its own (the bundle's used its
      author's token)
- [ ] Implicit globals of the bundle, now module variables (aInitiative, t, u, c, h, div);
      Campaign's loader sets isLoaded on window instead of the campaign

## 5. Comfort and guidance

- [ ] Tooltips that explain combat: why an attack is good or bad, entrenchment, experience, initiative
- [ ] Undo, better unit info, a better tutorial
- [ ] A refreshed UI look that keeps the period feel

## 6. Sound and music

- [ ] Soundtrack: main theme (dark Prussian march), planning, battle, victory, defeat; per side
- [ ] Missing sound effects: UI, end turn, capture, destroyed, surrender, buy, resupply, reinforcements
- [ ] Ambient loops (war room, battlefield, weather), volume settings

## 7. Bigger things

- [ ] Upscaled unit and map graphics (personal use: the assets come from PG2 and OpenGeneral)
- [ ] September 1939 campaign from the Polish side
- [ ] LLM general: an AI player that plans with the engine's legal options and writes reports
- [ ] AI arena: headless AI vs AI over many battles to measure AI changes
- [ ] Scenario editor, maps from OpenStreetMap
- [ ] PWA for offline play, desktop build (Tauri), own cloud saves
