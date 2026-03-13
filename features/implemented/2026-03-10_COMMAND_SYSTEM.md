# Command System

Unified action queue for actors. Right-click context menus, external order files, and any future AI-driven behavior all go through the same command pipeline.

## How it works

Each actor has a command queue (FIFO). When idle, the actor pops the next command before falling back to autonomous behavior. Issuing a command via right-click interrupts the actor's current activity, clears the queue, and starts the new command immediately. If any command fails, the entire queue is dropped and logged.

## Commands

| Command | Args | Effect |
|---------|------|--------|
| `Sleep` | `deck?, x?, y?` | Pathfind to bed (specific or nearest), sleep |
| `Eat` | `deck?, x?, y?` | Pathfind to stove (specific or nearest), eat |
| `Steer` | `deck?, x?, y?` | Pathfind to helm (specific or nearest), steer |
| `Navigate` | `deck?, x?, y?` | Pathfind to map table (specific or nearest), navigate |
| `ManCannon` | `deck?, x?, y?` | Pathfind to cannon (specific or nearest), man it |
| `Lookout` | `deck?, x?, y?` | Pathfind beside mast (specific or nearest), lookout |
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

## Chaining

Multiple commands in the queue execute sequentially. If any command fails, the rest are dropped.

```
GoTo 2 3 5
Eat
```
This walks to deck 2, tile (3,5), then eats at the nearest stove.

## Right-click menu

The context menu dispatches commands. It controls which options are shown (e.g. attraction checks for Kiss/Copulate, male-only barrel copulation), but execution goes through the command system.

## External order files

Order files live in `orders/orders_for_<name>.jsonl` (one per actor, lowercase name). The game polls these once per second, parses them, and empties them. New commands replace the actor's existing queue.

Two formats are supported. Lines starting with `#` are comments. Both formats can be mixed in the same file.

### Shorthand format (recommended)

Command name followed by space-separated positional arguments. Case-insensitive. Arg order is always `deck` before `x, y`.

```bash
# No args
echo 'Eat' >> orders/orders_for_anne.jsonl
echo 'Stop' >> orders/orders_for_anne.jsonl

# Positional args: deck x y
echo 'Sleep 1 5 3' >> orders/orders_for_anne.jsonl

# Optional args — omit trailing optionals
echo 'GoTo 3 5' >> orders/orders_for_anne.jsonl       # current deck
echo 'GoTo 2 3 5' >> orders/orders_for_anne.jsonl      # deck 2

echo 'GoToDeck 1' >> orders/orders_for_anne.jsonl

# String args fill rest of line
echo 'Tell 1 Ahoy matey' >> orders/orders_for_anne.jsonl
echo 'TakeItem 2-4-3 Grog ration' >> orders/orders_for_anne.jsonl
echo 'Drink Grog ration' >> orders/orders_for_anne.jsonl

# Nested commands with parens
echo 'Order 1 (Kiss 2)' >> orders/orders_for_anne.jsonl
echo 'Order 0 (Order 1 (Kiss 2))' >> orders/orders_for_anne.jsonl
echo 'Order 1 (Tell 2 Ahoy matey)' >> orders/orders_for_anne.jsonl
```

### JS object literal format

JS-style objects with unquoted keys:

```bash
echo '{name: "Sleep"}' >> orders/orders_for_anne.jsonl
echo '{name: "Sleep", deck: 1, x: 5, y: 3}' >> orders/orders_for_anne.jsonl
echo '{name: "Order", actorId: 1, order: {name: "Kiss", actorId: 2}}' >> orders/orders_for_anne.jsonl
```

Lines starting with `{` use this format; everything else is parsed as shorthand.

## Activity log

Command events appear bottom-right (last 8 entries, fading with age):
- Command received (with command names)
- Command started ("going to kiss Jack")
- Command failed ("can't reach Jack") — drops entire chain
- Action completed ("Anne kissed Jack", "Anne woke up", etc.)

## Implementation

- `Command` discriminated union type and `commandQueue` on `Actor`
- `tryExecuteCommand()` handles all command variants, `issueCommand()` interrupts + enqueues
- `menuItemToCommand()` converts context menu clicks to commands
- Shorthand parser with positional arg spec table
- Vite server plugin polls and parses order files via `GET /api/orders`
