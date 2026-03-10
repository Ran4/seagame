# Command System

Serializable action queue for actors. The right-click context menu, external order files, and any future AI-driven behavior all go through the same command system.

## Command interface

```typescript
interface Command {
  name: string;
  actorId?: number;   // target actor (Kiss, Pet, Order, Tell, Converse, Copulate)
  text?: string;      // for Tell
  order?: Command;    // for Order (recursive — the command the target should execute)
  x?: number;         // for GoTo, or specific tile (Sleep at this bed, Eat at this stove, etc.)
  y?: number;
  deck?: number;
  barrelKey?: string;  // for TakeItem (format: "deck-x-y")
  itemName?: string;   // for TakeItem, Drink
}
```

Each actor has `commandQueue: Command[]` (FIFO). When idle, the actor pops the next command before falling back to autonomous behavior. On failure, the entire queue is dropped and logged.

## Supported commands

| Command | Fields | Effect |
|---------|--------|--------|
| `Sleep` | `x?, y?, deck?` | Pathfind to bed (specific tile or random), sleep |
| `Eat` | `x?, y?, deck?` | Pathfind to stove (specific or random), eat |
| `Steer` | `x?, y?, deck?` | Pathfind to helm (specific or random), steer |
| `Navigate` | `x?, y?, deck?` | Pathfind to map table (specific or random), navigate |
| `ManCannon` | `x?, y?, deck?` | Pathfind to cannon (specific or random), man it |
| `Lookout` | `x?, y?, deck?` | Pathfind beside mast (specific or random), lookout |
| `Kiss` | `actorId` | Pathfind to target, kiss |
| `Copulate` | `actorId` | Pathfind to target, copulate |
| `CopulateBarrel` | `x, y, deck` | Pathfind to barrel, copulate with it |
| `Pet` | `actorId` | Pathfind to target, pet (human→animal) |
| `Converse` | `actorId` | Pathfind to target, start conversation |
| `GoTo` | `x, y, deck?` | Pathfind to tile (deck defaults to current) |
| `GoToDeck` | `deck` | Pathfind to any walkable tile on specified deck |
| `TakeItem` | `barrelKey, itemName` | Pathfind to barrel, take one unit of item |
| `Drink` | `itemName?` | Drink item from inventory (default: "Grog ration") |
| `LightLantern` | `x, y, deck` | Pathfind to lantern, light it |
| `ExtinguishLantern` | `x, y, deck` | Pathfind to lantern, extinguish it |
| `Stop` | — | Immediately go idle, free partners, clear path |
| `Tell` | `actorId, text` | Show speech bubble with text (cosmetic) |
| `Order` | `actorId, order` | Command another actor to execute `order`. Compliance based on friendship (<64 = 70% refusal). Clears the target's existing queue. |

## UI integration

The right-click context menu dispatches commands via `issueCommand()`. This function interrupts the actor's current activity (frees conversation/interaction partners), clears the command queue, pushes the new command, and forces the actor idle so it executes on the next tick. The menu still controls which options are shown (e.g. attraction checks for Kiss), but execution goes through the command system.

`Game.menuItemToCommand()` converts a `ContextMenuItem` into a `Command` based on the menu context (tile position, target actor, etc.).

## Chaining

Multiple commands in the queue execute sequentially:
```
GoTo {x: 3, y: 5, deck: 2}
Eat
```
This walks to (3,5,2) then eats at the nearest stove. If any command fails, the rest are dropped.

## External order files

Order files live in `orders/orders_for_<name>.jsonl` (one per actor, lowercase name). The Vite dev server plugin (`vite.config.ts`) serves `GET /api/orders` which reads all files, parses them, and empties them. The game polls this endpoint once per second.

Lines support JS-style object literals (unquoted keys):

```bash
# Tell Anne to sleep
echo '{name: "Sleep"}' >> orders/orders_for_anne.jsonl

# Tell Anne to sleep in a specific bed
echo '{name: "Sleep", x: 5, y: 3, deck: 1}' >> orders/orders_for_anne.jsonl

# Tell Anne to kiss actor 1 (Jack)
echo '{name: "Kiss", actorId: 1}' >> orders/orders_for_anne.jsonl

# Chain: go somewhere then eat
echo '{name: "GoTo", x: 3, y: 5, deck: 2}' >> orders/orders_for_anne.jsonl
echo '{name: "Eat"}' >> orders/orders_for_anne.jsonl

# Order Jack to kiss Mary (actor 2)
echo '{name: "Order", actorId: 1, order: {name: "Kiss", actorId: 2}}' >> orders/orders_for_anne.jsonl

# Take item from a barrel
echo '{name: "TakeItem", barrelKey: "2-4-3", itemName: "Grog ration"}' >> orders/orders_for_anne.jsonl

# Drink from inventory
echo '{name: "Drink", itemName: "Grog ration"}' >> orders/orders_for_anne.jsonl
```

New commands replace the actor's existing queue. The actor is forced idle so execution starts immediately.

## Activity log

All command events are logged to `Game.activityLog: ActivityLogEntry[]` and rendered bottom-right (last 8 entries, fading with age). Logged events:
- Command received (with command names)
- Command started ("going to kiss Jack")
- Command failed ("can't reach Jack") — drops entire chain
- Action completed ("Anne kissed Jack", "Anne woke up", etc.)

## Adding new commands

1. Add a case to `tryExecuteCommand()` in `crew.ts`
2. Add any new fields to the `Command` interface in `types.ts`
3. The command should set up pathfinding + target state, same as other commands do
4. Add the command name to `menuItemToCommand()` in `game.ts` if it should be accessible from the context menu

## Implementation files

- `types.ts` — `Command`, `ActivityLogEntry` interfaces, `commandQueue` on `Actor`
- `crew.ts` — `tryExecuteCommand()`, `issueCommand()`, completion logs in state handlers
- `game.ts` — `pollOrders()`, `menuItemToCommand()`, activity log management
- `renderer.ts` — `drawActivityLog()`
- `vite.config.ts` — `ordersPlugin()` Vite server middleware
- `orders/` — `.jsonl` files per actor
