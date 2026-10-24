# The command-line player

A scenario played from the terminal against the AI (#279): a person or a program (an LLM general, #45)
sends the commands a screen would and reads the game as text or JSON, the same commands in two ways:

- **Headless** (the default): the core (docs/CORE.md) plays without a browser from a save file. A
  turn of the AI takes well under a second: for the arena, tests, a program playing many games.
- **Live** (`--live`): the game plays on its page, as a person sees it. The program's moves and
  attacks go through the screen's own actions with their animations, its end of turn through the
  button, and the AI then plays its turn on the screen. A person watches the program play.

    npm run -s play -- help
    npm run -s play -- new drpzop01.xml --seed 7      # Panzer-Verbaende Ostpreussen, you play the Axis
    npm run -s play -- status
    npm run -s play -- map 0-8 8-24 --zoc
    npm run -s play -- attackers 2,20                  # who can hit the defender of 2,20, from where
    npm run -s play -- move 1 0,15
    npm run -s play -- end                             # the AI plays its turn, the report follows

## Live, on the game's page

    npm run play:live                                  # the dev server with the bridge, port 8644
    # open http://127.0.0.1:8644/ in a browser (the page is the game's screen)
    npm run -s play -- new drpzop01.xml --live         # or OPENPANZER_LIVE=http://127.0.0.1:8644 for every call
    npm run -s play -- move 1 0,15 --live              # the move is animated on the page, then the answer

`npm run play:live` is the dev server with `OPENPANZER_CLI=1`: its `cliBridge` (vite.config.mts) adds
cli/page.ts to the page and takes a call's words at `POST /__cli`, hands them to the page over the dev
server's websocket and its answer back. The page plays them on the running game (its core world,
src/mirror.ts) and answers with the same commands as headless; it waits for a move's or an attack's
animation, and for the AI's turn, before it answers. It doesn't know a turn's events, so it tells what
changed between the world before and after: the units the side saw moved, worn, gone or new, the
victory hexes taken, the prestige. Without the variable the dev server and the page are as before.
The page's dice are its own: `--seed` is headless only.

## Headless

Each call loads the game from a JSON file (`.play/game.json`, `--game FILE` or `$OPENPANZER_PLAY`),
answers or plays, and saves it: the core's state is plain data (docs/STATE.md) with its random
streams, so a game saved and loaded plays on with the same dice. `--json` gives any answer as data.
The code is cli/: `play.ts` the commands, `game.ts` the save and the turns, `known.ts` the side's
view, `combat.ts` the previews of attacks, `units.ts` and `board.ts` the rest, `report.ts` the
events as text, `files.ts` the game's files (shared with the tests' test/corefiles.ts).

## The side's view

Everything is shown as the person's side sees it. An enemy unit appears only on a hex the side
spots, or for the turn it was seen (it fired, a move came next to it). Every preview runs on the
**known world**: the state with the enemy units the side doesn't see taken off the map, the sight
computed again. A preview of a move or of an attack from another hex can't reveal a hidden unit,
and its estimate counts the support fire the side sees, as the attack cursor does.

## What it answers

| Command | What |
|---|---|
| `status` | turn and limit, the victory turns, prestige, every victory hex with who holds it and who has to take it, what the turn limit would decide now (#256) |
| `units [--ready]`, `enemies`, `unit ID` | strength, ammo and fuel against the full load, moves, entrenchment, experience, the transport, what the unit has done and can still do |
| `map [R0-R1 C0-C1] [--zoc]` | two characters a hex: the terrain, the unit (yours in capitals); `--zoc` marks the seen enemies' zones of control |
| `hex R,C` | terrain, road, owner, objective, deployment, the units there, who of yours can attack the enemy on it |
| `moves ID` | the hexes in reach with the move's cost (the points and the fuel it pays), the ones in a zone of control and the ones that take every point left |
| `targets ID [--from R,C]` | what the unit can attack, from where it stands or after a move: kills, losses, support fire (who), rugged defense, overrun, destroyed / retreats / surrenders |
| `attackers ID\|R,C` | the units that can hit a target this turn, now or from the best hex they can move to |
| `supply` | the units short of ammo, fuel or strength, and what a resupply or a reinforcement gives where they stand, at what cost |
| `shop [CLASS]`, `reserve` | what can be bought (the purchase screen's list: the country's equipment in service this year) with its transports; the units waiting to deploy and the free deployment hexes |
| `report` | the enemy's last turn as the side saw it |
| `check ACTION` | whether an action is allowed, or the core's reason, without playing it |

The actions are the core's commands (src/commands.ts): `move`, `attack`, `mount`, `unmount`,
`resupply`, `reinforce [--over]`, `embark`, `disembark`, `undo`, `buy`, `deploy`, `upgrade`,
`disband`, and `end`, which ends the turn and plays the AI's.

## What it leaves out

- Hotseat and two programs: the person plays one side, the AI the other.
- Campaigns: a single scenario of the list.
