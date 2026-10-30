# Roadmap

The remaster starts as a copy of the faithful reconstruction (openpanzer-src, a separate repo)
and changes it on purpose, one step at a time. The harness compares every build with that
reference: a refactor must leave the replays identical, a deliberate change shows exactly what
it changed (and the reference traces of that step are then the new expected behavior).

The work is in six milestones, in this order. Each task is a GitHub issue; the milestones on
GitHub hold the same lists. Why this order: players ask for a game that doesn't break their
campaign long before they ask for new rules, and the harness has to tell a deliberate change
from a bug before the rules change ([docs/RESEARCH.md](docs/RESEARCH.md)).

## Foundation ✅

### Reference point

- [x] Faithful reconstruction of all 21 modules in openpanzer-src, verified against the bundle
- [x] This repo, with the harness comparing against openpanzer-src

### TypeScript, then Vite

- [x] 2a. Modules become .ts files, type checked by tsc 7, types blanked out by the build:
      still global scripts, no behavior change (replays identical)
- [x] 2b. Real types everywhere: tsc and noImplicitAny clean (from 365 and 1491 errors), the
      model as classes, replays identical
- [x] 2b+. The local stand-in interfaces modules declared for each other's types replaced by
      the real ones (imports made them visible)
- [x] 2c. ES modules instead of globals, Vite dev server with reload on change, production
      build; the implicit globals became module variables; the harness runs the dev server

## 1. Stable campaigns ✅ ([milestone](https://github.com/szymdzum/openpanzer-remastered/milestone/1))

A campaign never breaks. Players' reports from the Panzer Marshal pages are mostly here.

The rule fixes here wait for the new engine core (docs/REFACTOR.md step 4): the gameplay is
frozen while it is built, so no fix is done twice. The save fixes come first (#128), and so do
the AI crashes (#100, #101).

- [x] The harness checks the classes of bugs players report: a campaign scenario starts like
      the same scenario alone (#64), every side of every scenario can deploy and buy (#60)
- [x] Campaign and save bugs: Magyar Massacre (#61), 100 Regiments (#65), half hexes and time
      of day after loading (#54, #55), a destroyed unit blocking its hex (#58), naval combat
      freeze (#56), trains and objective cities (#59)
- [x] Fixes to the original, one at a time with the replay difference as evidence, checked
      against the PG2 rules (Luis Guzman's PG2 file specs): ships in ports (#19), reinforce and
      resupply in one turn (#20), AI prestige (#15, #21, #22), mud table (#23), combat log
      (#24, #28), tooltips (#25), gunrange (#26), attack end handler (#29); the legacy
      leftovers Campaign.isLoaded (#27) and implicit globals (#34) stay open outside the milestones
- [x] Cloud saves off until the game has its own (the bundle's used its author's token); the
      game's own are in milestone 6 (#33)
- [ ] 2d. Constructor functions to classes where the load order allows it, which removes the
      `new (X as unknown as XConstructor)` casts (#30, outside the milestones)

## 2. Readable ([milestone](https://github.com/szymdzum/openpanzer-remastered/milestone/2))

The player sees what will happen and why: the new UI, a 1:1 port of the old one (stage D, #130,
docs/ui/PLAN.md). No rule changes.

- [x] Attack preview (#7) and tooltips that explain combat (#35), unit cycling and end turn
      warning (#8), move path (#32), undo (#36), unit info (#37), sharp on HiDPI (#31), the war
      room look (#39)
- [ ] The smallest text at 10px (#400), tablets (#350)

## 3. Promises kept ([milestone](https://github.com/szymdzum/openpanzer-remastered/milestone/3))

What the manual and the code promise works ([docs/MECHANICS.md](docs/MECHANICS.md)). There is
one game, the remaster (#53): where the code and the manual differ, the manual wins. Before the
AI is tuned, since these change combat.

- [ ] Weather (#1), suppression (#2), leader abilities (#3), recon and ZOC (#4), initiative and
      terrain (#14), the manual's numbers (#18)

## 4. Remastered AI ([milestone](https://github.com/szymdzum/openpanzer-remastered/milestone/7))

The AI of [docs/ai/remastered-design.md](docs/ai/remastered-design.md), step by step, each
measured in the arena (#46). The playtests' findings are sub-issues of the steps.

- [ ] The arena as a measuring stick (#408)
- [ ] Perception and analysis (#409): no peeking at hidden units (#17)
- [ ] The staff and its doctrines (#410): defend objectives (#5), withdraw and finish off (#6),
      artillery and air before the assault (#233, #234, #259), not mounted in the enemy's reach (#315)
- [ ] The commander (#411): the main effort (#258), the turn clock (#232), the taken hex held
      (#312), the reinforcements in the plan (#94)
- [ ] Tactical search (#412), the LLM general (#45)
- [ ] Tuning, difficulty that changes the AI (#16, #413)

## 5. New rules ([milestone](https://github.com/szymdzum/openpanzer-remastered/milestone/4))

Each discussed in its issue before any code.

- [ ] Units fighting together (#9, #10), air superiority (#11), supply lines (#12),
      snowballing (#13), optional turn limit (#49), recon and hidden strength (#50)
- [ ] Scenarios with more than one solution (#52)

## 6. Platforms and content ([milestone](https://github.com/szymdzum/openpanzer-remastered/milestone/5))

- [ ] Offline, desktop and mobile from one build, saves across devices (#48)
- [ ] Polish campaigns: September 1939 and Maczek's road (#44)
- [ ] Scenario editor (#47), custom battles (#63), playing a friend (#67)
- [ ] Soundtrack (#40), sound effects (#41), ambience and volume (#42)

## Later ([milestone](https://github.com/szymdzum/openpanzer-remastered/milestone/6))

Ideas for after the port, not planned yet: who beats whom (#51), victory conditions on the map
(#62), the campaign's branches (#57), railroads (#362), deploying under an aircraft (#66), a
better tutorial (#38), upscaled maps and units (#43; the assets have no license of their own:
fine for a free, non-commercial remaster, ask before app stores).
