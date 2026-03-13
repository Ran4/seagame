# Live Debugging

Read game state via HTTP while the game runs. Works with `curl`, `WebFetch`, or any HTTP client.

## Architecture

```
Game loop (client)                    Vite plugin (server)
    │                                      │
    ├─ every 1s: POST /api/state ────────► cache latest snapshot
    │                                      │
    │         GET /api/state ◄──────────── serve cached snapshot ◄── Claude (WebFetch)
    │                                      │
    └─ every 1s: GET /api/orders ◄──────── serve & clear orders ◄── Claude (Write file)
```

The client serializes the `World` object every second and POSTs it. The server caches the latest snapshot and serves it on GET with optional query param filtering.

## Endpoints

### `GET /api/state` — full state
Returns log, actors summary, time, and barrels.

### `GET /api/state?log` — activity log
Last 50 log entries with game timestamps.

### `GET /api/state?actors` — actor summaries
Array of `{ id, name, type, state, deck, tile: {x,y}, conditions }`.

### `GET /api/state?actor=<name>` — single actor detail
Full detail including relations (with resolved names), inventory, statuses, hunger, energy.

### `GET /api/state?barrels` — barrel inventories
Map of barrel key → item list.

### `GET /api/state?time` — game time
`{ gameTime, timeOfDay, brightness, speed }`.

## Browser console

The `World` object is also exposed directly:
```js
window.__world              // full world object
window.__world.actors[0]    // first actor
window.__world.activityLog  // activity log
```

## Debug loop example

1. Write an order: `echo '{"name":"Eat"}' > orders/orders_for_anne.jsonl`
2. Wait 2 seconds
3. Check result: `curl http://localhost:7070/api/state?log`

## Files

- `src/debug-state.ts` — `serializeState(world)` produces the JSON snapshot
- `src/main.ts` — exposes `window.__world`, runs 1s POST interval
- `vite.config.ts` — `statePlugin()` handles POST cache + GET with filtering
