# How shipped strategy games build their AI

Research from October 2026 into how professional studios and researchers build computer opponents
for strategy games, checked against remastered-design.md. Many primary sources (GDC talks,
gamedeveloper.com) were behind paywalls or blocked, so some points come from interviews, patch
notes and talk summaries; those are marked second-hand.

## What the games do

### Unity of Command (2x2 Games): a library of tactics

The closest relative: an operational WW2 hex wargame. Its developer, Ante Turudić, described the AI
in an interview with Armchair General:

- **Pattern matching.** The AI holds a list of "tactics", each a situation it can recognise plus a
  preprogrammed response. It scans the map for the situations, scores the payoff of each, and the
  best one fires. They modelled the tactics on how they reacted themselves.
- **The number of tactics decides how it feels.** With about 10 it was predictable; with more than
  15 it became adaptive, because one tactic opened the way for another in ways nobody planned.
- **Stateless, and so defensive.** It has no plan that lasts beyond a turn, so it can't carry out
  an offensive; they built a good defender and left the attacker for a later game. The front line
  is laid out with the graph problem of interdiction.
- **Scenario hints.** The scenario designer places a few hints for the AI: which railways and
  bridges matter for supply, where the weak areas and second lines are, and historical behaviour
  (aggressive at Stalingrad, passive north of the Don in Case Blue). A few per scenario; each one
  costs the AI time.

### The Battle for Wesnoth: candidate actions

Open source, turn-based, hexes; its default AI since 1.9, the RCA AI ("register candidate
action"), is documented on its wiki. A list of candidate actions (attacks, grabbing villages,
recruiting, retreating injured units...), each with an evaluation that gives a score and an
execution. The highest score runs, then everything is evaluated again, until no action wants to
act. Behaviour is tuned with "aspects" (aggression, caution), and goals set move-to targets.
Scenario authors add their own candidate actions in Lua.

### Civilization V (Firaxis): four layers

Ed Beach led the AI. It works on four levels, from grand strategy down to an operational AI that
oversees a war front and a tactical AI that moves single units (Wikipedia, second-hand). The
tactical AI reasons about "dominance zones", regions of the map held by one side; the patch notes
show it checking whether a unit would pillage inside an enemy dominance zone, and that a citadel
"projects danger". In other words: influence regions, used by the tactics.

### Total War (Creative Assembly): analysis, budget, search for allocation

From Tommy Thompson's AI and Games series and a 2018 talk by Guy Davidson and Duygu Cakmak
(second-hand):

- Earlier campaign AIs were reactive and state-based, poor at planning ahead. From Shogun 2 to
  Rome II it was rebuilt to deliberate, as separate subsystems: a world-state analyser,
  finances, construction, diplomacy, task management, technology, characters.
- A turn runs in phases: before moving, it finds threats and opportunities, sets the budget and
  conducts diplomacy; then task allocation assigns the armies; then the moves.
- **Monte Carlo Tree Search decides the allocation of resources and tasks**, not single unit
  moves (Alex Champandard, 2014). Slow to decide but usually right; it got harder with more
  factions.

### Killzone 2 (Guerrilla Games): strategy, squad, individual

Multiplayer bots in three layers: one strategy AI per faction giving orders such as Defend or
Advance to squad AIs, which drive individual bots planned with an HTN planner (Verweij's thesis,
2007; the 2009 Game AI Conference slides). HTN planning went on to drive the high-level decisions
in Guerrilla's Decima engine.

### Hearts of Iron IV (Paradox): concentration as a feature

An expansion added "Force Concentration" to simulate armoured pushes, and players lost games to it.
Earlier, the AI's battle plans waited until every unit was in place, which made its offensives
slow (players' reports). Concentrating force is right, but waiting for perfect conditions isn't.

### Utility AI: data, curves and tools

Dave Mark's Infinite Axis Utility System (Guild Wars 2: Heart of Thorns, GDC 2015 with ArenaNet)
builds every behaviour from scored considerations, each passed through a response curve, all data
designers can edit. A GDC 2024 talk on practical utility AI stresses tuning with data and tools to
debug the scores.

## Fun, cheating and difficulty

- Soren Johnson (Civilization IV, Old World), "Playing to Lose", GDC 2008: a "good" AI tries to
  win, a "fun" AI lets the player feel that playing well wins. The AI should play the role of a
  plausible historical leader, not a human exploiting the rules. Players judge cheating poorly:
  they see it where there is none and miss it where there is.
- Johnson again (GDC 2022, second-hand): players say they want AIs that play like humans, but
  don't; an AI that metagames (ganging up on the leader) feels unfair.
- Civilization VI makes higher difficulties harder with bigger statistical bonuses for the AI; in
  Unity of Command II the lead developer called the normal difficulty "seal clubbing". Bonuses are
  still how most shipped games make a hard AI.

## Language models

- **Vox Deorum** (Chen et al., arXiv 2512.18564, 2025): a hybrid "LLM+X" AI for Civilization V
  with the Vox Populi mod. The model reasons about strategy and hands tactical execution to the
  game's algorithmic AI. Over 2,327 complete games, two open-source models with a simple prompt
  played competitively against Vox Populi's improved AI, in their own, different styles. Latency
  and cost are named as the obstacles.
- **CivBench** (arXiv 2609.02459): a long-horizon benchmark for tool-using agents in Civilization
  VI, building on Vox Deorum's infrastructure.

## Research on wargames

Goodman, Risi and Lucas, *AI and Wargaming* (arXiv 2009.08922, 2020), a review for Dstl: what sets
wargames apart from the usual AI testbeds and which recent advances fit them. The UK Dstl and the
Alan Turing Institute have studied AI-assisted wargaming since; their focus is AI that helps
human players rather than replaces them.

## What it means for remastered-design.md

Confirmed:

- **Layers are what everyone ships**: Civilization V, Killzone 2 and Total War all split strategy,
  operations and tactics. remastered-design.md's commander, staff and tactics are the industry's
  shape.
- **Re-evaluating after every action** is what Wesnoth's RCA AI does.
- **Influence regions** (Civilization V's dominance zones) as the base of the tactics.
- **Search where the choices are few and large**: Total War runs MCTS over allocating armies to
  tasks, not over single units. In the design, search belongs in the staff's allocation and the
  order of attacks within an operation, not in every unit's move.
- **The language model as strategist over an algorithmic executor** is Vox Deorum's architecture,
  and it held its own over thousands of games.

Added or sharpened:

1. **Scenario hints.** Unity of Command's designers place a few hints per scenario: key supply
   lines, weak areas, historical behaviour. PG2 is a game of hand-made scenarios, so this is cheap
   and fits: a scenario's file could say where the Germans historically went around Mława. A new
   piece of the design.
2. **The doctrine as a library of tactics.** Unity of Command's lesson is that the number of
   tactics makes the difference between predictable and adaptive (about 15 was the turning
   point). The staff's doctrine should be a growing list of small tactics (candidate actions, as in
   Wesnoth) rather than a few big scripts, each tested with a puzzle.
3. **Memory across turns.** Unity of Command's AI is stateless, so it can't attack: an offensive
   needs a plan that outlives a turn. Our controller may keep memory between its calls (the
   Controller's comment, docs/STATE.md D6): the operations must persist from turn to turn, and be
   saved with the game or rebuilt deterministically when a game is loaded.
4. **Concentration without paralysis.** HOI4's battle plans waited for every unit; an operation
   needs a deadline after which it attacks with what it has, tied to the turn clock (#232).
5. **Fun over strength.** Play like a plausible general of the time, don't metagame, and keep
   difficulty honest; the remaster can be the exception to "hard means bonuses" (#16).
6. **Tools.** The utility talks and Total War both insist on debugging tools; the debug overlay
   in the design isn't optional.

## Sources

- Armchair General, "Unity of Command: a look behind its challenging artificial intelligence":
  https://armchairgeneral.com/unity-of-command-a-look-behind-its-challenging-artifical-intelligence.htm
- Unity of Command II on Steam (difficulty discussion):
  https://steamcommunity.com/app/809230/discussions/0/3338785229804651517
- Wesnoth wiki, RCA AI: https://wiki.wesnoth.org/RCA_AI ; Wesnoth AI framework:
  https://wiki.wesnoth.org/Candidate_action ; Creating custom AIs:
  https://wiki.wesnoth.org/Creating_Custom_AIs
- Civilization V, Wikipedia: https://en.wikipedia.org/wiki/Civilization_V ; patch notes on dominance
  zones: https://www.co-optimus.com/article/5118/civilization-v-december-patch-is-a-go.html and
  https://www.co-optimus.com/article/5956/civilization-v-continues-to-evolve-ai-improvements-and-gameplay-fixes-abound.html
- AI and Games, "Revolutionary Warfare: the AI of Total War part 3":
  https://www.gamedeveloper.com/design/revolutionary-warfare-the-ai-of-total-war-part-3- ; part 2:
  https://www.gamedeveloper.com/design/evolution-of-war-the-ai-of-total-war-part-2- ; part 4:
  https://www.gamedeveloper.com/design/make-peace-not-war-the-ai-of-total-war-part-4-
- Guy Davidson and Duygu Cakmak, "How AI can deliver entertainment in Total War" (ACCU 2018):
  https://accu.org/conf-docs/PDFs_2018/Guy_Davidson__Duygu_Cakmak_-_How_AI_can_deliver_entertainment_in_Total_War.pdf
- Alex Champandard, Monte Carlo Tree Search in Total War: Rome II (2014):
  https://stafforini.com/works/champandard-2014-monte-carlo-tree/
- Tim Verweij, "A Hierarchically-Layered Multiplayer Bot System" (2007):
  https://www.guerrilla-games.com/media/News/Files/VUA07_Verweij_Hierarchically-Layered-MP-Bot_System.pdf ;
  Killzone 2 multiplayer bots (slides): https://www.slideshare.net/guerrillagames/killzone-2-multiplayer-bots ;
  HTN planning in Decima: https://guerrilla-games.com/read/htn-planning-in-decima
- Paradox, Hearts of Iron IV developer corners:
  https://admin-forum.paradoxplaza.com/forum/developer-diary/hearts-of-iron-iv-anniversary-week-developer-corners.1760451 ;
  players on slow battle plans: https://steamcommunity.com/app/394360/discussions/0/340412122419188310
- Dave Mark, Infinite Axis Utility System: https://gameai.com/iaus.php ; GDC 2024, Practical
  Utility AI: https://gdcvault.com/play/1034572/AI-Summit-Practical-Utility
- Soren Johnson, "Playing to Lose: AI and Civilization" (GDC 2008):
  https://www.designer-notes.com/?p=1318 ; "Game AI & our cheatin' hearts":
  https://www.gamedeveloper.com/game-platforms/analysis-game-ai-our-cheatin-hearts ; GDC 2022 Old
  World postmortem: https://gamespress.com/Soren-Johnson-GDC-2022-Talk
- PC Gamer / PCGamesN on Civilization's AI bonuses: https://www.pcgamesn.com/civilization-vii/better-ai
- Chen et al., Vox Deorum: https://arxiv.org/abs/2512.18564 ; CivBench: https://arxiv.org/pdf/2609.02459
- Goodman, Risi and Lucas, AI and Wargaming: https://arxiv.org/abs/2009.08922
- NATO JWC, AI reshaping military wargaming: https://www.jwc.nato.int/article/ai-reshaping-military-wargaming/
