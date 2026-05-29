# 08 — Commands, Menu, Items, Assets & Notices

Reference for the command/menu pipeline, item & barrel systems, sprite/audio asset loading, and the notice board. Covers `src/menu.ts`, `src/crew/commands.ts`, `src/command-shorthand.ts`, `src/items.ts`, `src/sprites.ts`, `src/audio.ts`, `src/notices.ts`, plus the wiring in `src/game.ts` and `vite.config.ts`.

All line numbers are as of this writing — grep the symbol if they drift.

---

## 1. The command pipeline (end-to-end)

There is ONE execution path for every actor action. Two front-ends feed it:

```
Right-click menu  ──► buildContextMenu()  ──► handleMenuClick() ──► menuItemToCommand() ──┐
(src/menu.ts)                                                                              ├─► issueCommand()/commandQueue
External order file ──► vite ordersPlugin ──► pollOrders() ──► parseShorthand/JSON ────────┘     (src/crew/commands.ts)
(orders/*.jsonl)                                                                                          │
In-game command bar ──► command-input.ts ──► parseShorthand() ──► issueCommand() ─────────────────────────┘
                                                                                                          ▼
                                                                                            tryExecuteCommand() per tick
```

- `Command` is a serializable discriminated union (`name` discriminant) in `types.ts:364-389`. This is the single source of truth — every front-end produces a `Command`, and `tryExecuteCommand()` consumes it.
- Each `Actor` has a `commandQueue: Command[]`. `tryExecuteCommand()` (commands.ts:36) processes `commandQueue[0]` once when the actor becomes idle and ready.

### Command union (types.ts:364-389)

| Command | Fields | Notes |
|---|---|---|
| `Sleep` / `Eat` / `Steer` / `Navigate` / `ManCannon` / `Lookout` | `deck?`, `x?`, `y?` | All position args optional → picks a random matching tile if omitted |
| `GoTo` | `deck?`, `x`, `y` | x/y required |
| `GoToDeck` | `deck` | walks to first reachable WALKABLE tile on that deck |
| `CopulateBarrel` | `deck`, `x`, `y` | |
| `LightLantern` / `ExtinguishLantern` | `deck`, `x`, `y` | |
| `Kiss` / `Copulate` / `Pet` / `Converse` | `actorId` | actor-targeting |
| `TakeItem` | `barrelKey`, `itemName` | |
| `Drink` | `itemName?` | defaults to `'Grog ration'` |
| `Sing` / `Dance` / `GroupDance` | — | group/solo social |
| `BuryAtSea` | `corpseActorId` | |
| `SetHealth` | `amount` | debug/cheat |
| `Stop` | — | cancels current activity |
| `Tell` | `actorId`, `text?` | cosmetic speech bubble |
| `Order` | `actorId`, `order: Command` | one actor commands another (recursive) |

### `issueCommand(actor, command, allActors)` (commands.ts:390-410)

Immediate dispatch used by the menu and in-game command bar. It:
1. Cleans up the actor's current activity (stops conversation via `stopConversation`, frees a `copulationTarget` partner, nulls `copulationTarget`).
2. `actor.commandQueue.length = 0` then pushes the single command (does NOT queue — replaces).
3. Sets `state = IDLE`, `path = []`, `idleTimer = 0` so it executes next tick.

> Order files (`pollOrders`) bypass `issueCommand` and push multiple commands directly onto `commandQueue` (game.ts:790-791), so they DO queue/chain. Menu and command-bar are single-shot.

### `tryExecuteCommand(member, decks, crew, activityLog, gameTime, world?, audio?)` (commands.ts:36-387)

Returns `true` if a command was consumed this tick. Key behaviours:
- **Order refusal** (commands.ts:43): if `member.profile.morale < 64` and `cmd.name !== 'Stop'`, 50% chance to refuse — logs and clears the WHOLE queue.
- `member.commandQueue.shift()` removes the command BEFORE the switch (commands.ts:82).
- `fail(reason)` logs and does `commandQueue.length = 0` (drops the entire chain). `log(text)` appends to `activityLog`.
- `setupActorTarget(actorId, targetState, beside)` (commands.ts:60): shared helper for Kiss/Copulate/Pet/Converse. Sets reciprocal `copulationTarget` on both actors, freezes the target (`idleTimer = 999`), and pathfinds adjacent (`orderCrewToAdjacentTile`) or beside (`orderCrewBesideTile`). On failure it unwinds both targets.

Per-command handlers (all in the `switch (cmd.name)` at commands.ts:84):
- Tile-seeking commands (`Sleep`/`Eat`/`Steer`/`Navigate`/`ManCannon`) use `findTileOrRandom(decks, TileType.X, cmd)` → if x/y given use them, else `pickRandom` of all tiles of that type → `orderCrewToAdjacentTile(member, target, decks, STATE)`.
- `Lookout`: pathfinds to one of the 4 tiles around a `MAST`.
- `CopulateBarrel`: sets `copulationTarget = {type:'barrel',...}` then walks adjacent.
- `TakeItem`: parses `barrelKey` as `"deck-x-y"`, sets `member.takeTarget`, walks adjacent with state `TAKING_ITEM` (the actual transfer happens on arrival — see §4).
- `Drink`: removes the item from `member.profile.inventory` immediately, sets `state=DRINKING`, `stateTimer=DRINK_DURATION` (=5, commands.ts:7), stashes it in `member.consumingItem`. Effect applied on completion (see §3 spoilage/consume note).
- `Sing` (commands.ts:232): gathers up to 5 nearby idle/wandering humans on the same deck; needs ≥2 total. Calls `audio.playShanty({male,female}, deck)`. Duration = `audio.shantyDuration || 30`.
- `Dance` (solo) / `GroupDance` (gathers nearby like Sing).
- `BuryAtSea`: sets `member.carryingCorpseId`, walks adjacent to corpse with state `CARRYING_CORPSE`.
- `Stop`: frees conversation/copulation partners, drops carried corpse back to `world.corpses`, resets to IDLE.
- `Order`: friendship-gated compliance (`friendship < 64` → 70% refuse), clears the target's queue and pushes `cmd.order`.
- `Tell`: cosmetic — sets `member.speechBubbleText` for 3s.
- `default`: `fail("unknown command ...")`.

### RECIPE: add a brand-new command (e.g. `Fish`)

1. **types.ts:364** — add to the `Command` union: `| { name: 'Fish'; deck?: number; x?: number; y?: number }`.
2. **types.ts:133** — add a `CrewState.FISHING = 'fishing'` if it needs its own state; add to `STATE_NAMES` (types.ts:156) — **this map is exhaustive (`Record<CrewState,string>`), so a missing entry is a compile error.**
3. **crew/commands.ts:84** — add a `case 'Fish':` to the switch. Use `findTileOrRandom` + `orderCrewToAdjacentTile(member, target, decks, CrewState.FISHING)`; `log(...)`/`fail(...)` as needed.
4. **crew/update.ts** — handle `CrewState.FISHING` in `updateActors()`'s state switch (around update.ts:552 where DRINKING/EATING completions live) to apply the effect when `stateTimer` elapses.
5. **To make it menu-orderable**: add a `TILE_ACTIONS` entry (types.ts:214) keyed by the tile type, e.g. `[TileType.WATER]: [{ label: 'Fish', targetState: CrewState.FISHING }]`, then add a `case CrewState.FISHING: return { name: 'Fish', deck: targetDeck, x: tileX, y: tileY };` to `menuItemToCommand`'s tile switch (menu.ts:481).
6. **To make it shorthand/order-file-parsable**: add `Fish: ['deck?','x?','y?']` to `COMMANDS` in command-shorthand.ts:9.

> Invariant: a `targetState` in a `TILE_ACTIONS` entry MUST have a matching `case` in `menuItemToCommand` (menu.ts:481-491), or the menu click silently produces `null` and nothing happens.

---

## 2. Context menu (`src/menu.ts`)

Three public functions; menu is just data (`ContextMenu`/`ContextMenuItem` in types.ts:179-202), rendered by `drawContextMenu()` in `renderer.ts` and clicked via `handleMenuClick`.

### `buildContextMenu(world, click, hoveredItem)` (menu.ts:8-277)

Returns `ContextMenu` (open), `null` (close), or `undefined` (no change). Builds `items: ContextMenuItem[]` from, in order:

1. **Crew-panel right-click** (menu.ts:14-34): clicking an inventory item in the right-side crew panel (`x >= CANVAS_WIDTH-210`) yields a "Drink <item>" entry. Uses `itemData: { barrelKey: '', itemName }`.
2. **Right-clicked an actor** (menu.ts:59-185):
   - Human, non-NPC: "Stop <action>" (if busy), "Go to <deck>" per other deck, and when it's the *selected* actor: "Dance", "Drink <item>" per unique inventory item.
   - **Interact ▶ submenu** (requires a *different* actor selected, menu.ts:91):
     - NPC + human selected: "Talk to X" / "Pet X" (animal NPC like the cat). Role-gated extras by `statuses.get('npc').role`: bartender → "Buy grog" (`action:'buy_grog'`), merchant → "Browse wares" (`action:'browse_wares'`), innkeeper → "Recruit sailor" (`action:'recruit_sailor'`, disabled if someone has `recruited_this_visit`).
     - Human petting a non-NPC animal: "Pet".
     - Human↔human: "Converse" / "Kiss" / "Copulate" with threshold gating (drunk/tipsy/lustful lower thresholds; menu.ts:151-156). Disabled variants show "(not friendly)"/"(low attraction)".
3. **Corpse right-click** (menu.ts:188): "Bury X at sea" (`action:'bury_at_sea'`, `corpseActorId`).
4. **Tile actions** (menu.ts:208-264): only when a *human* is selected and no crew was clicked. Looks up `TILE_ACTIONS[tileType]` (clone it — `[...TILE_ACTIONS[t]!]`). Special handling:
   - `MAST`: only if vertically connected across decks; on upper deck shows "Climb down".
   - `BARREL`: filters out "Copulate" unless selected actor is male & not `dickless`. Also pulls `world.barrelInventory.get("deck-x-y")` into `pendingBarrelItems` (the visual item grid).
   - `LANTERN`: dynamic — "Light" vs "Extinguish" based on `world.lanternOil.get("deck-x-y")`.
   - `MAP_TABLE` + someone navigating → "Open Map".
   - `GANGPLANK` + docked → "Leave harbor" (`action:'leave_harbor'`, disabled without a helmsman).
   - `NOTICE_BOARD` → "Read notices" (`action:'read_notices'`, defined in `TILE_ACTIONS`).

### `handleMenuClick(contextMenu, click)` (menu.ts:280-419)

Returns clicked leaf `ContextMenuItem` / `null` (outside → close) / `undefined` (keep open: submenu-parent or disabled). Checks deepest first: **barrel "Take" flyout → barrel slot grid → level-3 submenu → level-2 submenu → top-level items.** Geometry (item height 24, pad 4, barrel slots 28px/5 cols) MUST stay in sync with `renderer.ts` `drawContextMenu`. Edge-clamping (`mx + itemW > CANVAS_WIDTH` flips left) is duplicated from the renderer.

### `menuItemToCommand(contextMenu, decks, menuItem)` (menu.ts:422-499)

Maps a clicked `ContextMenuItem` → `Command | null`. Dispatch order:
1. `action === 'bury_at_sea'` → `BuryAtSea`.
2. `action === 'take_item'` → `TakeItem`.
3. `targetActorId` set → `Kiss`/`Copulate`/`Converse`/`Pet` by `targetState`.
4. `contextMenu.actorId` set (self-actions) → `GoToDeck` / `Drink` / `Dance` / `Stop`.
5. Tile-targeted → resolves connected deck for `MAST`/`STAIRS`, then maps `targetState` to the corresponding tile command (menu.ts:481-491). `STAIRS`/`MAST` + `IDLE` → `GoTo`.

> `action`-string items (`buy_grog`, `browse_wares`, `recruit_sailor`, `leave_harbor`, `read_notices`) are NOT commands — they are intercepted in `game.ts:533-567` BEFORE `menuItemToCommand` and handled inline (push grog to inventory, call `recruitSailor`, `startUndocking`, `readNoticeBoard`, etc.). `menuItemToCommand` returns `null` for them.

### RECIPE: add a new TILE_ACTIONS entry

1. types.ts:214 — `[TileType.X]: [{ label: '...', targetState: CrewState.Y }]` (or `action: 'foo'` for a non-command UI action).
2. If it produces a command: add the `case CrewState.Y:` in `menuItemToCommand` (menu.ts:481) AND a `case 'Cmd':` in `tryExecuteCommand`.
3. If it's an `action` string: add an `else if (menuItem.action === 'foo')` branch in game.ts:533.

---

## 3. Items (`src/items.ts`)

### `Item` interface (types.ts:334-343)
```
name, createdAt (game seconds), weight (grams/unit, integer),
description, stackable, quantity (1 if not stackable),
spoilAfter (seconds | null = never), hungerRestore (0-255 added when consumed)
```

### Factory functions (items.ts)
| Fn | name | weight | stackable | spoilAfter | hungerRestore |
|---|---|---|---|---|---|
| `createCutlass(gameTime=0)` | "Cutlass" | 900 | no | null | 0 |
| `createGrogRation(gameTime=0)` | "Grog ration" | 285 | no | null | 0 |
| `createSemen(gameTime)` | "Semen" | 5 | yes | 3600 | 5 |

`createSemen` requires a gameTime arg (no default) because it spoils. Grog's *drunk* effect is special-cased by name on consume (`update.ts:557`, name === 'Grog ration'), NOT via a field.

### `updateSpoilage(barrelInventory, actors, gameTime, activityLog)` (items.ts:27-47)
Called once/sec from `update()` (game.ts:745). Removes items where `spoilAfter !== null && gameTime - createdAt >= spoilAfter`, from both barrels and every actor's inventory; deletes empty barrel keys. Logs each spoilage.

### Consume effects
Item consumption (`Drink`) finishes in `update.ts` DRINKING case (~update.ts:552-565): logs, applies grog drunkenness if name matches, and `if (consumingItem.hungerRestore > 0)` adds to `profile.hunger`. (Eating from a stove uses a fixed restore of 180/270, NOT an item — update.ts:350.)

### RECIPE: add a new item type (fish, treasure, gold, treasure map, cannonball, medicine, wood)
1. Add a factory in items.ts following the table above. Pick fields: `stackable` (gold/cannonballs yes; treasure map no), `spoilAfter` (fish e.g. 7200; gold null), `hungerRestore` (fish > 0; gold 0).
2. If it needs a behavioural effect on consume, add a name-check or a new field + handling in the DRINKING/EATING completion in `update.ts`. (Prefer a field over name-matching unless it's a one-off like grog.)
3. Spoilage works automatically via `updateSpoilage` if `spoilAfter` is set.
4. Spawn it: push into an actor's `profile.inventory`/`hands` (see `crew/factory.ts:183-190`) or into a barrel (`barrelInventory.set("deck-x-y", [...])`, see game.ts:143-162, harbor.ts:200).
5. For a sprite, add the lowercase name to `itemNames` in sprites.ts:85 and drop `public/sprites/items/item__<name>.png` (optional — fallback renders without it; see §5).

---

## 4. Barrels & inventory transfer

- **Keying**: `world.barrelInventory: Map<string, Item[]>` keyed by the string `` `${deck}-${x}-${y}` `` (e.g. `"1-7-3"`). Same scheme used by `lanternOil`. `TakeItem` splits it with `cmd.barrelKey.split('-').map(Number)` (commands.ts:193) — so deck/x/y must be non-negative integers and the format is positional.
- **Into inventory** (`performTakeItem`, movement.ts:22-55): triggered when an actor finishes walking with state `TAKING_ITEM` (movement.ts:92). For stackable items with qty>1 it decrements the barrel stack and merges/creates a 1-unit stack in inventory (splitting `weight` proportionally). For non-stackable / last unit it splices the whole item out. Empty barrels are deleted from the map.
- **Into a barrel**: there is no generic deposit command — barrels are seeded at world creation (game.ts:143-162) and refilled at harbor (harbor.ts:200). Copulation deposits semen into barrels via lust logic (`createSemen`, see crew/lust.ts / update.ts).
- **Invariant**: always delete the key when a barrel empties (`updateSpoilage`, `performTakeItem`, and harbor cleanup harbor.ts:367 all do this), so the barrel-items menu doesn't show empty grids.

---

## 5. Sprites (`src/sprites.ts`)

`loadSprites(): Promise<SpriteSheet>` (sprites.ts:61) loads all PNGs from `/sprites/` and returns:
```
SpriteSheet { tiles: Map<TileType,Img>, waterFrames: Img[], crew: DirectionalSprite[],
              animals: Map<string,DirectionalSprite>, items: Map<string,Img>, bubbles: Map<string,Img> }
```
- **Fault-tolerance**: every load is `.catch(() => null)`. Missing tile/item/bubble/animal/crew sprites are simply absent from the maps. The renderer (`renderer.ts` / `render/*`) falls back to colored rectangles + hand-drawn icons when a sprite is missing — **the game ships and runs fully without any generated PNGs.** Only `water` + `water2` are non-tolerant (`water2Load` has no catch, sprites.ts:94), so those two are effectively required.
- **`SPRITE_RESOLUTION`** (sprites.ts:6): `0` = use raw hi-res; >0 nearest-neighbor downscales via `downscale()`.
- **Directional sprites** (`loadDirectionalSprite`, sprites.ts:38): expects `<base>__south.png` (required), optional `__north.png`/`__west.png` (east = west flipped at render time). Returns `null` if south missing.
- **Registries** (all are arrays/lists you extend):
  - `tileNames` (sprites.ts:62): `[TileType, fileBase]` pairs → `/sprites/tiles/tiles__<base>.png`.
  - `crewNames` (sprites.ts:97): `crew_red/blue/green/yellow` → `/sprites/actors/actor__<name>__{south,north,west}.png`.
  - `animalTypes` (sprites.ts:103): `dog/parrot/monkey/cat` → `/sprites/actors/actor__animal_<type>__*.png`.
  - `itemNames` (sprites.ts:85): `['cutlass','semen','grog_ration']` → `/sprites/items/item__<name>.png`.
  - `bubbleNames` (sprites.ts:86): `['heart','broken_heart','music_note']` → `/sprites/bubbles/bubble__<name>.png`. Must mirror the `ThoughtBubble` union (types.ts:357).

### RECIPE: add a sprite
- **Tile**: follow `.claude/rules/adding_new_tile_types.md` — add to `tileNames` (sprites.ts:62), add the gen prompt in `scripts/generate-sprites.mjs`, run it. Tooltip name lives in `TILE_NAMES` (renderer.ts).
- **Thought bubble**: follow `.claude/rules/adding_new_thought_bubbles.md` — extend `ThoughtBubble` (types.ts:357), add to `bubbleNames` (sprites.ts:86), add gen prompt, run generator, set `member.thoughtBubble`/`thoughtBubbleTimer`. Add a fallback case in `drawCrewMember()` (renderer.ts) if no PNG.
- **Item**: add the lowercase key to `itemNames`. PNG optional (fallback rendering).
- Generation requires `OPENAI_API_KEY`; scripts skip existing files. You can always ship without generating — fallbacks cover everything except water frames.

---

## 6. Audio (`src/audio.ts`)

`AudioManager` (audio.ts:12). SFX are preloaded in the constructor via `preload(name, src, category, volume=0.5)` into `sounds: Map<string,{audio,category}>`. **Registry = the `this.preload(...)` calls (audio.ts:27-40).** Current SFX: `click, stairs, deck_change, lantern_light, lantern_extinguish, glug_male, glug_female, kiss, dance_clap, harbor_arrive, tavern_brawl, recruit, notice_board, cat_meow` — all from `/audio/elevenlabs-generated/`.

- **Categories**: `'ui'` plays at full volume; `'world'` attenuates by deck distance (`volume *= 0.4^|soundDeck-activeDeck|`, audio.ts:87).
- **Trigger**: `audio.play(name, soundDeck)` (audio.ts:81). Clones the node so overlapping plays work. **Missing files are tolerated** — `play` no-ops if the name isn't registered, and `.play().catch(()=>{})` swallows load/autoplay errors. Browser autoplay policy: music only starts after `startMusicOnInteraction()` (first click).
- **Mute**: `toggleMute()` (music) / `toggleSfxMute()` (SFX), persisted to localStorage (`seagame_sound_muted`, `seagame_sfx_muted`).
- **Shanties**: `discoverShanties()` (audio.ts:105) HEAD-probes a hardcoded list (`copper_beacon, powderwake, riptide_preacher, seaghost_steps, shiverin_ropes`) for `__mixed.mp3` and records the available ones. `playShanty({male,female}, deck)` (audio.ts:116) picks a random available shanty and layers voice tracks (`male_1/male_2/female_1/female_2`) based on singer composition; reads duration into `shantyDuration` (used by the `Sing` command). `stopShanty()` halts them.

### RECIPE: add/trigger an SFX
1. Drop the file in `public/audio/elevenlabs-generated/` (or sfx/) — see `scripts/generate-sfx.mjs` (3 backends).
2. Add a `this.preload('my_sfx', '/audio/.../my_sfx.mp3', 'world'|'ui', volume)` line in the constructor (audio.ts:27).
3. Call `audio.play('my_sfx', deck)` from game logic (most callers in game.ts/update.ts). Missing file = silent, no crash.
4. New shanty folder: add its name to the `knownShanties` array in `discoverShanties` (audio.ts:106). Generation: `.claude/rules/sea_shanty_generation.md`.

---

## 7. Notices (`src/notices.ts`)

`readNoticeBoard(world)` (notices.ts:42) — invoked when a crew member uses the NOTICE_BOARD (via the `read_notices` action in game.ts:563). It:
1. Builds the candidate pool with `getNotices(world)` (notices.ts:5): static harbor blurbs + gameplay tips + **dynamic** ones gated on world state (e.g. "Ships sail between here and X" only when docked; "CREW WANTED" only when human non-NPC crew count < 4, notices.ts:34).
2. Shuffles, pushes a `--- Notice Board ---` header + 2-3 random notices into `world.activityLog`.
3. **Hidden-island reveal**: if any non-NPC human has `skills.navigation >= SKILL_MASTERY`, 50% chance to reveal one un-spotted hidden island (`world.spottedIslands.add(island.id)`, notices.ts:53-65).

To add a notice: push a string in `getNotices`. Dynamic ones read from `world` directly (no separate data file). All notice text must reference real mechanics (project convention).

---

## 8. Shorthand & order files (`src/command-shorthand.ts` + `vite.config.ts`)

### Shorthand grammar (`COMMANDS` spec, command-shorthand.ts:9-35)
Each command name maps to an arg-spec array. Suffix conventions (command-shorthand.ts:3-7):
- `name` (no suffix) = required int
- `name?` = optional int (only consumed if the next token looks numeric)
- `name$` = required string token (single word)
- `name...` = rest of line as string (stops before an unmatched `)`)
- `name()` = recursive nested command inside parens

Examples:
```
Sleep                # random bed
Sleep 1 3 5          # deck 1, x=3, y=5
GoTo 0 10 4          # GoTo deck0 x10 y4   (GoTo: ['deck?','x','y'] — deck optional, x/y required)
TakeItem 1-7-3 Grog ration   # barrelKey then rest-of-line itemName
Drink Grog ration
Order 2 (Sleep 1 3 5)        # actor 2 ordered to Sleep — nested command in parens
Tell 3 Get to the helm!      # text... captures the rest
```
- `parseShorthand(line)` → one `Command`. `parseShorthandLines(text)` → `Command[]`, skipping blank lines and `#` comments (command-shorthand.ts:163). Lookup is case-insensitive (command-shorthand.ts:38).
- Parser throws on unknown command / missing required arg / malformed int — callers wrap in try/catch.

### Order files (`orders/orders_for_<name>.jsonl`)
- The Vite **`ordersPlugin`** (vite.config.ts:65) serves `GET /api/orders`. It reads every `orders/orders_for_*.jsonl`, extracts the actor name from the filename (`orders_for_anne.jsonl` → `anne`), parses each non-blank/non-`#` line, then **empties the file** (vite.config.ts:113).
- Per line: if it starts with `{` it's parsed as a **JS object literal** via `new Function` (so `{ name: 'Sleep', deck: 1 }` works, unquoted keys OK); otherwise it's parsed as **shorthand** via `parseShorthand` (vite.config.ts:95-101). Both forms can be mixed in one file.
- The client polls once/sec: `update()` increments `orderPollTimer`, and at >=1s calls `pollOrders(world)` (game.ts:733-738, 779-815). `pollOrders` matches the actor by case-insensitive name, **clears the existing queue, pushes all parsed commands** (so order files DO chain), and forces the actor idle so execution starts immediately. Unknown actor names are logged.

### RECIPE: add a command to shorthand/order files
Add one entry to `COMMANDS` (command-shorthand.ts:9) with the right arg-spec suffixes; matching field names must equal the `Command` union fields. No other change needed — both the in-game command bar and order-file plugin use the same parser.

---

## Gotchas / invariants summary
- `STATE_NAMES` is an exhaustive `Record<CrewState,string>` — every new `CrewState` needs an entry or it won't compile.
- A `TILE_ACTIONS` `targetState` with no matching `case` in `menuItemToCommand` silently does nothing.
- `barrelInventory`/`lanternOil` keys are positional `"deck-x-y"` strings — `TakeItem` splits on `-`, so coordinates must be non-negative integers.
- Always delete empty barrel keys.
- `issueCommand` (menu/command-bar) is single-shot; order files chain.
- Order refusal at morale < 64 can silently drop a whole command chain.
- Sprites and SFX are fault-tolerant (fallback rendering / silent SFX) — the game ships without generated assets, EXCEPT the two water frames which are not catch-guarded.
- `createSemen` requires an explicit `gameTime` (it spoils); the other factories default to 0.
