# Harbor Towns

**Date:** 2026-03-23

Harbors now contain buildings with interiors and NPCs that crew can interact with.

## Buildings

Four buildings arranged in a 2x2 grid within the harbor land area, connected by paths to the wharf and gangplank:

| Building | Location (cols, rows) | Contents | Purpose |
|----------|----------------------|----------|---------|
| **Tavern** | cols 1-9, rows 1-6 | Tables, barrels, stove, lantern | Drinking, socializing |
| **Inn** | cols 13-21, rows 1-6 | Beds, lantern | Resting |
| **Market** | cols 1-9, rows 10-15 | Barrels (goods), display tables, lantern | Trade (future: buy/sell) |
| **Smithy** | cols 13-21, rows 10-15 | Work tables, forge (stove), lantern | Repairs (future) |

### Building layout
- Walls: `HARBOR_WALL` tile type (not walkable, stone/brick appearance)
- Floors: `HARBOR_FLOOR` tile type (walkable, cobblestone appearance)
- Doorways: open gaps in walls (no doors — crew walks right in)
- Furniture: reuses existing tile types (TABLE, BED, BARREL, STOVE, LANTERN)

### New tile types
- `TileType.HARBOR_WALL` — non-walkable stone/brick wall
- `TileType.HARBOR_FLOOR` — walkable cobblestone floor

### Paths
- Two main east-west roads (rows 8 and 17 area) connecting buildings to the wharf
- Vertical paths from building doors to the roads
- Road connects to wharf at col 23, enabling pathfinding from gangplank to buildings

## NPCs

Eight NPCs spawn when docking at any harbor and are removed on undocking:

**Shopkeepers** (confined to their buildings, 4-tile wander radius):

| NPC | Role | Color | Position | Special Action |
|-----|------|-------|----------|----------------|
| Greg | Bartender | Orange | Tavern | Buy grog |
| Betty | Innkeeper | Purple | Inn | Recruit sailor |
| Walter | Merchant | Green | Market | Browse wares |
| Ida | Blacksmith | Red | Smithy | — |

**Townsfolk** (wander freely, 10-tile radius):

| NPC | Color | Position |
|-----|-------|----------|
| Old Tom | Brown | Town square |
| Maggie | Tan | Town square |
| Little Jim | Blue | South area |

**Animals**: One harbor **cat** (random name from pool of 6, `cat` ActorType, 0.7x scale). Crew can pet it.

### NPC properties
- Actors with `statuses.set('npc', { role, homeX, homeY })`
- No needs decay (hunger, energy, morale stay constant)
- Wander within 4 tiles of home position
- Can be conversed with by crew (role-specific dialogue)
- Show ambient speech bubbles (*polishes a mug*, *hammers metal*, etc.)
- Name labels show role in yellow: "Greg (bartender)"
- Cannot be commanded (no stop/go-to-deck/drink options in context menu)

### NPC conversations
Each role has 8-10 unique conversation scripts (3 lines each). When a crew member talks to an NPC, the system picks a role-specific script instead of the normal conversation pool. After an NPC conversation, crew get +3 morale and 40% chance of a gossip speech bubble.

### NPC interactions (context menu)
Right-click a human NPC with a crew member selected:
- **"Talk to [Name]"** — starts a conversation using NPC scripts
- **"Buy grog"** (bartender) — instantly adds a grog ration to inventory
- **"Recruit sailor"** (innkeeper) — spawns a new crew member (1 per visit)
- **"Browse wares"** (merchant) — shows available goods in activity log

Right-click the cat NPC:
- **"Pet [Name]"** — standard petting interaction (+2 friendship, heart bubbles)

## Harbor features

### Barrel seeding
Tavern and market barrels are seeded with 3 grog rations each on docking. Barrel inventory is cleaned up on undocking.

### Building lanterns
Lanterns inside buildings start lit (oil=100) when docking. Wharf lanterns start unlit (oil=0) as before.

### Morale boost
All crew get a +20 morale target bonus while docked at harbor (`world.docking.phase === 'docked'`).

### Town exploration
Idle crew members have a 30% chance to wander toward harbor buildings (HARBOR_FLOOR tiles) instead of random ship wandering when docked.

### Autonomous harbor behavior
When docked, crew autonomously:
- **Eat at tavern** (60% chance to prefer tavern stove over ship stove when hungry)
- **Sleep at inn** (60% chance to prefer inn beds over ship beds when tired)
- **Take grog** from harbor barrels (5% chance per idle tick)

### NPC greetings
When a crew member walks near an NPC (within 3 tiles), the NPC says a greeting (role-specific). Greetings have a 15s cooldown per NPC.

### Docked island name
The "Leave harbor" button area now shows "Docked at [Island Name]".

### Crew panel NPC support
When an NPC is selected, the crew panel shows their role instead of sex (e.g. "Greg (bartender)").

### Speech bubble ticking
Non-conversation speech bubbles (NPC ambient lines, starvation complaints) now tick down in all states, not just TALKING.

## Technical details

### Harbor layout
Defined in `harbor.ts` as a 41×33 ASCII layout. Characters:
- `#` = HARBOR_WALL, `_` = HARBOR_FLOOR
- `T` = TABLE, `B` = BED, `K` = STOVE, `R` = BARREL, `P` = LANTERN
- `L` = LAND, `W` = WHARF, `l` = LANTERN (wharf), `.` = WATER

### NPC lifecycle
- **Spawn:** `spawnHarborNPCs()` called from `completeDocking()`. Creates 4 actors with unique IDs (max existing ID + 1). Relations initialized bidirectionally with all existing actors (friendship=128).
- **Remove:** `startUndocking()` filters out actors with `npc` status. NPC relations are removed from remaining actors. NPCs are never stranded.

### Sprite generation
New prompts added to `generate-sprites.mjs` for `harbor_wall` (stone bricks) and `harbor_floor` (cobblestones).

## Tavern Brawl
When docked, if two drunk idle crew are within 3 tiles of each other in the harbor, there's a small chance (~0.1%/sec) of a brawl:
- Both lose 5-15 HP (never lethal)
- Friendship drops -20 both ways
- Both get +15 morale (fun fight!)
- Speech bubbles: "Take that!", "Arrr!", "Ye scallywag!"
- Activity log: "[A] and [B] got into a tavern brawl!"
- Plays `tavern_brawl` SFX

## Recruit Crew at Inn
Right-click innkeeper with crew selected → "Recruit sailor". Spawns a new crew member with:
- Random name (from pool of 16 male/female names, avoiding duplicates)
- Random skills (10-60 each)
- Spawns near the gangplank on deck 1
- Relations initialized with all existing crew (friendship 96-160)
- Limited to 1 recruit per harbor visit (tracked via `recruited_this_visit` status)
- Plays `recruit` SFX

## Notice Board
A `NOTICE_BOARD` tile in the town square. Right-click with crew selected → "Read notices":
- Shows 2-3 notices picked from a mix of static and dynamic entries
- **All notices are truthful** — they reference real islands, real game mechanics, and current world state (no fictional rumors)
- Static notices: harbor descriptions, gameplay tips (morale, lanterns, shanties, dogs, grog, etc.)
- Dynamic notices: routes to other harbors, crew-wanted ads when shorthanded
- If crew has an expert navigator (navigation ≥ 192), 50% chance to reveal a hidden island on the map
- Plays `notice_board` SFX

## Merchant Wares
Right-click merchant → "Browse wares" shows a list of available goods in the activity log. Currently display-only (trading not yet implemented).

## Autonomous Harbor Drinking
When docked and idle, crew with grog in inventory have 8% chance per idle tick to drink it autonomously. This creates a natural flow: crew goes to tavern → takes grog from barrel → drinks it → gets drunk → might start a brawl.

## Post-Conversation Gossip
After talking to an NPC, crew gets:
- +3 morale boost from socializing
- 40% chance of a gossip speech bubble relaying what they heard (e.g. "The bartender says storms are coming...")

## Arrival Celebration
When docking completes, all human crew get heart thought bubbles (4 seconds), showing their happiness at being on land. Plays `harbor_arrive` SFX.

## SFX
New sound effects added for harbor interactions:
- `harbor_arrive` — ship docking, creaking wood, seagulls
- `tavern_brawl` — fist fight sounds
- `recruit` — enthusiastic pirate voice
- `notice_board` — paper rustling
- `cat_meow` — cute cat sound

## Future work
- Per-island unique layouts, NPCs, and names
- Actual trading with gold currency at merchant
- Smithy repairs damaged ship objects
- Tavern gambling minigame
- Island-specific rumors tied to game state
- Cat sprite (currently uses colored circle fallback)
