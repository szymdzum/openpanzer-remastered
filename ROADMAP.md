# Roadmap

The remaster starts as a copy of the faithful reconstruction (openpanzer-src, a separate repo)
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
      `new (X as unknown as XConstructor)` casts (#30)

## 3. Quick visible wins

- [ ] Sharp canvases on HiDPI/Retina screens (devicePixelRatio) (#31)
- [ ] Combat odds preview before an attack (the engine already estimates the result) (#7)
- [ ] Move path preview (#32)

## 4. Fixes to the original

One change at a time, with the replay difference as its evidence; each bug is a GitHub issue.
Candidates from the reconstruction notes, to check against the PG2 rules (Luis Guzman's PG2
file specs):

- [ ] Ships resupply and reinforce only outside ports (inverted check) (#19)
- [ ] Unit.reinforce sets `hasRessuplied` (typo), so a unit can reinforce and resupply in one turn (#20)
- [ ] AI spends prestige twice (reinforcement budget set before purchases) (#21)
- [ ] AI permanently prunes the shared equipment lists when buying (#22)
- [ ] Mud movement table: towed cost 21 for Fortification (#23)
- [ ] Combat log scenario info button hides the log (#24)
- [ ] "No Ammo" and "No Fuel" tooltips share an id (#25)
- [ ] Unit info writes gunrange 1 into the equipment data (#26)
- [ ] Combat log entries get no turn: Map.attackUnit reads a global map (#28)
- [ ] The attack end handler reads map.currentUnit after clearing it (#29)
- [ ] Cloud saves on GitHub gists: off until the game has its own (the bundle's used its
      author's token) (#33)
- [ ] Implicit globals of the bundle, now module variables (aInitiative, t, u, c, h, div);
      Campaign's loader sets isLoaded on window instead of the campaign (#27, #34)

## 5. Comfort and guidance

- [ ] Tooltips that explain combat: why an attack is good or bad, entrenchment, experience, initiative (#35)
- [ ] Undo, better unit info, a better tutorial (#36, #37, #38)
- [ ] A refreshed UI look that keeps the period feel (#39)

## 6. Sound and music

- [ ] Soundtrack: main theme (dark Prussian march), planning, battle, victory, defeat; per side (#40)
- [ ] Missing sound effects: UI, end turn, capture, destroyed, surrender, buy, resupply, reinforcements (#41)
- [ ] Ambient loops (war room, battlefield, weather), volume settings (#42)

## 7. Bigger things

- [ ] Upscaled unit and map graphics (the assets have no license of their own: units from
  OpenGeneral Icons, maps from PG2; fine for a free, non-commercial remaster, ask before app stores) (#43)
- [ ] September 1939 campaign from the Polish side (#44)
- [ ] LLM general: an AI player that plans with the engine's legal options and writes reports (#45)
- [ ] AI arena: headless AI vs AI over many battles to measure AI changes (#46)
- [ ] Scenario editor, maps from OpenStreetMap (#47)
- [ ] PWA for offline play, desktop build (Tauri), own cloud saves (#48)

## 8. Gameplay

The rules, from what the manual promises to what players always wished for, each discussed in
its issue before any code ([docs/RESEARCH.md](docs/RESEARCH.md)). Order: the promises first.

- [ ] Promised but missing: weather (#1), suppression (#2), leader abilities (#3), recon and
      ZOC (#4), initiative and terrain (#14), the manual's numbers (#18)
- [ ] AI: defend objectives (#5), withdraw and finish off (#6), easier levels feeding the AI
      (#15), difficulty that changes the AI (#16), no peeking at hidden units (#17)
- [ ] Readability: attack preview (#7), unit cycling and end turn (#8), who beats whom (#52)
- [ ] Classic or remaster rules (#53), then: units fighting together (#9, #10), air superiority
      (#11), supply lines (#12), snowballing (#13), optional turn limit (#49), recon and hidden
      strength (#50)
- [ ] Scenarios with more than one solution (#51)
