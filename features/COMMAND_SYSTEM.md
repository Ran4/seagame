# Command System

Serializable action queue for actors. Used for external injection (order files), AI-driven behavior, and future persistence.

## Command interface

```typescript
interface Command {
  name: string;
  actorId?: number;   // target actor (Kiss, Pet, Order, Tell, Converse, Copulate)
  text?: string;      // for Tell
  order?: Command;    // for Order (recursive — the command the target should execute)
  x?: number;         // for GoTo
  y?: number;
  deck?: number;
}
```

Each actor has `commandQueue: Command[]` (FIFO). When idle, the actor pops the next command before falling back to autonomous behavior. On failure, the entire queue is dropped and logged.

## Supported commands

| Command | Fields | Effect |
|---------|--------|--------|
| `Sleep` | — | Pathfind to random bed, sleep |
| `Eat` | — | Pathfind to random stove, eat |
| `Steer` | — | Pathfind to helm, steer |
| `Navigate` | — | Pathfind to map table, navigate |
| `Kiss` | `actorId` | Pathfind to target, kiss |
| `Copulate` | `actorId` | Pathfind to target, copulate |
| `Pet` | `actorId` | Pathfind to target, pet (human->animal) |
| `Converse` | `actorId` | Pathfind to target, start conversation |
| `GoTo` | `x, y, deck?` | Pathfind to tile (deck defaults to current) |
| `Stop` | — | Immediately go idle, clear path |
| `Tell` | `actorId, text` | Show speech bubble with text (cosmetic) |
| `Order` | `actorId, order` | Command another actor to execute `order`. Compliance based on friendship (<64 = 70% refusal). Clears the target's existing queue. |

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

# Tell Anne to kiss actor 1 (Jack)
echo '{name: "Kiss", actorId: 1}' >> orders/orders_for_anne.jsonl

# Chain: go somewhere then eat
echo '{name: "GoTo", x: 3, y: 5, deck: 2}' >> orders/orders_for_anne.jsonl
echo '{name: "Eat"}' >> orders/orders_for_anne.jsonl

# Order Jack to kiss Mary (actor 2)
echo '{name: "Order", actorId: 1, order: {name: "Kiss", actorId: 2}}' >> orders/orders_for_anne.jsonl
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
3. The command should set up pathfinding + target state, same as context menu orders do

## Implementation files

- `types.ts` — `Command`, `ActivityLogEntry` interfaces, `commandQueue` on `Actor`
- `crew.ts` — `tryExecuteCommand()`, completion logs in state handlers
- `game.ts` — `pollOrders()`, activity log management
- `renderer.ts` — `drawActivityLog()`
- `vite.config.ts` — `ordersPlugin()` Vite server middleware
- `orders/` — `.jsonl` files per actor
