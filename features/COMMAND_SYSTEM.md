# Command System

Serializable action queue for actors. The right-click context menu, external order files, and any future AI-driven behavior all go through the same command system.

## Command type

Discriminated union on `name` — each variant declares only the fields it needs:

```typescript
type Command =
  | { name: 'Sleep';              deck?: number; x?: number; y?: number }
  | { name: 'Eat';               deck?: number; x?: number; y?: number }
  | { name: 'Steer';             deck?: number; x?: number; y?: number }
  | { name: 'Navigate';          deck?: number; x?: number; y?: number }
  | { name: 'ManCannon';         deck?: number; x?: number; y?: number }
  | { name: 'Lookout';           deck?: number; x?: number; y?: number }
  | { name: 'GoTo';              deck?: number; x: number; y: number }
  | { name: 'GoToDeck';          deck: number }
  | { name: 'CopulateBarrel';    deck: number; x: number; y: number }
  | { name: 'LightLantern';      deck: number; x: number; y: number }
  | { name: 'ExtinguishLantern'; deck: number; x: number; y: number }
  | { name: 'Kiss';              actorId: number }
  | { name: 'Copulate';          actorId: number }
  | { name: 'Pet';               actorId: number }
  | { name: 'Converse';          actorId: number }
  | { name: 'TakeItem';          barrelKey: string; itemName: string }
  | { name: 'Drink';             itemName?: string }
  | { name: 'Stop' }
  | { name: 'Tell';              actorId: number; text?: string }
  | { name: 'Order';             actorId: number; order: Command };
```

Each actor has `commandQueue: Command[]` (FIFO). When idle, the actor pops the next command before falling back to autonomous behavior. On failure, the entire queue is dropped and logged.

## Supported commands

| Command | Fields | Effect |
|---------|--------|--------|
| `Sleep` | `deck?, x?, y?` | Pathfind to bed (specific tile or random), sleep |
| `Eat` | `deck?, x?, y?` | Pathfind to stove (specific or random), eat |
| `Steer` | `deck?, x?, y?` | Pathfind to helm (specific or random), steer |
| `Navigate` | `deck?, x?, y?` | Pathfind to map table (specific or random), navigate |
| `ManCannon` | `deck?, x?, y?` | Pathfind to cannon (specific or random), man it |
| `Lookout` | `deck?, x?, y?` | Pathfind beside mast (specific or random), lookout |
| `GoTo` | `deck?, x, y` | Pathfind to tile (deck defaults to current) |
| `GoToDeck` | `deck` | Pathfind to any walkable tile on specified deck |
| `CopulateBarrel` | `deck, x, y` | Pathfind to barrel, copulate with it |
| `LightLantern` | `deck, x, y` | Pathfind to lantern, light it |
| `ExtinguishLantern` | `deck, x, y` | Pathfind to lantern, extinguish it |
| `Kiss` | `actorId` | Pathfind to target, kiss |
| `Copulate` | `actorId` | Pathfind to target, copulate |
| `Pet` | `actorId` | Pathfind to target, pet (human→animal) |
| `Converse` | `actorId` | Pathfind to target, start conversation |
| `TakeItem` | `barrelKey, itemName` | Pathfind to barrel, take one unit of item |
| `Drink` | `itemName?` | Drink item from inventory (default: "Grog ration") |
| `Stop` | — | Immediately go idle, free partners, clear path |
| `Tell` | `actorId, text?` | Show speech bubble with text (cosmetic) |
| `Order` | `actorId, order` | Command another actor to execute `order`. Compliance based on friendship (<64 = 70% refusal). Clears the target's existing queue. |

## UI integration

The right-click context menu dispatches commands via `issueCommand()`. This function interrupts the actor's current activity (frees conversation/interaction partners), clears the command queue, pushes the new command, and forces the actor idle so it executes on the next tick. The menu still controls which options are shown (e.g. attraction checks for Kiss), but execution goes through the command system.

`menuItemToCommand()` in `menu.ts` converts a `ContextMenuItem` into a `Command` based on the menu context (tile position, target actor, etc.).

## Chaining

Multiple commands in the queue execute sequentially:
```
GoTo {deck: 2, x: 3, y: 5}
Eat
```
This walks to deck 2, (3,5) then eats at the nearest stove. If any command fails, the rest are dropped.

## External order files

Order files live in `orders/orders_for_<name>.jsonl` (one per actor, lowercase name). The Vite dev server plugin (`vite.config.ts`) serves `GET /api/orders` which reads all files, parses them, and empties them. The game polls this endpoint once per second.

Two formats are supported: **shorthand** (terse, recommended) and **JS object literals** (original format). Lines starting with `#` are comments. Both formats can be mixed in the same file.

### Shorthand format

Command name followed by space-separated arguments. Case-insensitive. Arguments are positional, matching the command's field order.

```bash
# Basic commands
echo 'Eat' >> orders/orders_for_anne.jsonl
echo 'Sleep 5 3 1' >> orders/orders_for_anne.jsonl
echo 'Kiss 2' >> orders/orders_for_anne.jsonl

# Optional args — omit trailing optionals
echo 'GoTo 3 5' >> orders/orders_for_anne.jsonl
echo 'GoTo 3 5 2' >> orders/orders_for_anne.jsonl
echo 'GoToDeck 1' >> orders/orders_for_anne.jsonl

# Rest-of-line string args
echo 'Tell 1 Ahoy matey' >> orders/orders_for_anne.jsonl
echo 'TakeItem 2-4-3 Grog ration' >> orders/orders_for_anne.jsonl
echo 'Drink Grog ration' >> orders/orders_for_anne.jsonl

# Nested commands with parens
echo 'Order 1 (Kiss 2)' >> orders/orders_for_anne.jsonl
echo 'Order 0 (Order 1 (Kiss 2))' >> orders/orders_for_anne.jsonl
echo 'Order 1 (Tell 2 Ahoy matey)' >> orders/orders_for_anne.jsonl
```

**Argument types by suffix in spec:**

| Suffix | Type | Example |
|--------|------|---------|
| (none) | Required int | `actorId` → `Kiss 2` |
| `?` | Optional int (skipped if next token isn't a number) | `deck?` → `GoTo 3 5` or `GoTo 3 5 2` |
| `$` | Required string token | `barrelKey$` → `TakeItem 2-4-3 ...` |
| `...` | Rest of line (paren-aware) | `text...` → `Tell 1 Ahoy matey` |
| `()` | Recursive command in parens | `order()` → `Order 1 (Kiss 2)` |

### JS object literal format

The original format — JS-style objects with unquoted keys:

```bash
echo '{name: "Sleep"}' >> orders/orders_for_anne.jsonl
echo '{name: "Sleep", deck: 1, x: 5, y: 3}' >> orders/orders_for_anne.jsonl
echo '{name: "Kiss", actorId: 1}' >> orders/orders_for_anne.jsonl
echo '{name: "Order", actorId: 1, order: {name: "Kiss", actorId: 2}}' >> orders/orders_for_anne.jsonl
echo '{name: "TakeItem", barrelKey: "2-4-3", itemName: "Grog ration"}' >> orders/orders_for_anne.jsonl
```

### Format detection

Lines starting with `{` are parsed as JS object literals. All other non-empty, non-comment lines are parsed as shorthand.

New commands replace the actor's existing queue. The actor is forced idle so execution starts immediately.

## Activity log

All command events are logged to `World.activityLog: ActivityLogEntry[]` and rendered bottom-right (last 8 entries, fading with age). Logged events:
- Command received (with command names)
- Command started ("going to kiss Jack")
- Command failed ("can't reach Jack") — drops entire chain
- Action completed ("Anne kissed Jack", "Anne woke up", etc.)

## Adding new commands

1. Add a new variant to the `Command` union in `types.ts`
2. Add a case to `tryExecuteCommand()` in `crew.ts`
3. The command should set up pathfinding + target state, same as other commands do
4. Add the command name to `menuItemToCommand()` in `menu.ts` if it should be accessible from the context menu

## Implementation files

- `types.ts` — `Command` union type, `ActivityLogEntry` interface, `commandQueue` on `Actor`
- `crew.ts` — `tryExecuteCommand()`, `issueCommand()`, completion logs in state handlers
- `game.ts` — `createWorld()`, `update()`, `pollOrders()`, activity log management
- `menu.ts` — `buildContextMenu()`, `handleMenuClick()`, `menuItemToCommand()`
- `renderer.ts` — `drawActivityLog()`
- `command-shorthand.ts` — `parseShorthand()`, `parseShorthandLines()`, shorthand spec table
- `vite.config.ts` — `ordersPlugin()` Vite server middleware (uses both parsers)
- `orders/` — `.jsonl` files per actor
