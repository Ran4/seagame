# 07 — Rendering & Visual FX

Reference for extending the render layer: pipeline order, the day/night brightness/tint
system, actor drawing (sprite fallback, scale, wobble), UI panels/widgets/tooltips, and tile
overlays. Read this before adding weather/storm/flash overlays, HP bars, gold counters,
combat UI, or per-tile markers (tentacles, damage cracks, treasure-X).

All canvas math uses immediate-mode `CanvasRenderingContext2D`. There is no scene graph, no
z-buffer — **draw order = paint order**. `ctx.imageSmoothingEnabled = false` (pixel art).

---

## 1. Files & public API

| File | Role |
|---|---|
| `src/renderer.ts` | `class Renderer` — the **only orchestrator**. `render(world, mousePos, soundMuted, sfxMuted)` runs the whole pipeline each frame. Holds `ctx`, `sprites`, `hoveredItem`. |
| `src/render/index.ts` | Barrel re-export of all `draw*` functions + the `TILE_NAMES` map (tooltip names). |
| `src/render/context.ts` | `RenderContext` interface — the per-frame bundle passed to every `draw*`. |
| `src/render/tiles.ts` | `drawWater`, `drawDeck`, `drawTileIconFallback` (private). |
| `src/render/actors.ts` | `drawActor`, `drawActorOverlays`, `drawCorpse`, `drawSpeechBubble` (private). |
| `src/render/menu.ts` | `drawContextMenu` (3-level submenus + barrel item grid). |
| `src/render/map.ts` | `drawMapOverlay` (full-screen world map). |
| `src/render/docking.ts` | `drawDockButton` / `isDockButtonClicked` / `drawDockedBar` / `isLeaveHarborClicked`. |
| `src/render/ui/index.ts` | `drawUI` (deck selector + dispatches to crew/object panels). |
| `src/render/ui/panels.ts` | `drawCrewPanel`, `drawObjectPanel`, `drawCorpsePanel`, `buildMoraleTooltip` (private). |
| `src/render/ui/widgets.ts` | `drawSoundButton`, `drawActivityLog`, `drawCompass`, `drawBar`, `drawItemSlot`, `drawSettingsButton`, `drawSettingsPanel`. |
| `src/render/ui/tooltips.ts` | `drawTooltip` (tile name), `drawItemTooltip`, `drawBarTooltip`. |

`Renderer.render()` is called once per frame from `src/main.ts:64` inside `loop()`, immediately
after `update()`. `world.time` is wall-clock seconds accumulated in the loop (`main.ts:61`).

**Constants** (`src/types.ts:1-3`): `TILE_SIZE = 32`, `CANVAS_WIDTH = 960`, `CANVAS_HEIGHT = 540`.

---

## 2. RenderContext (the per-frame bundle)

Defined `src/render/context.ts:4`:

```ts
interface RenderContext {
  ctx: CanvasRenderingContext2D;
  sprites: SpriteSheet | null;             // null until sprites async-load → always null-check
  mousePos: { x: number; y: number };       // SCREEN coords
  lanternOil: Map<string, number>;          // key "deck-x-y" → oil 0..100
  brightness: number;                        // 0.3 (night) .. 1.0 (day), see §4
  camera: Camera;                            // { x, y } world-pixel scroll offset
  deckIndex: number;                         // currently viewed deck
  hoveredItem: { item, x, y } | null;        // OUT param: widgets write here, renderer reads after
  hoveredBarTooltip: string[] | null;        // OUT param: panels write here, renderer reads after
}
```

`rc` is constructed once at `renderer.ts:69` and threaded into every `draw*` call.
**Invariant:** `hoveredItem` / `hoveredBarTooltip` are deferred-tooltip channels — a widget
sets them while drawing; the renderer draws the tooltip *last* (`renderer.ts:213-218`) so it
floats above everything. If you add a hoverable HUD element that needs a tooltip, add a new
field to `RenderContext` and draw it in that final block (don't draw tooltips inline or they'll
be painted under later UI).

---

## 3. Render pipeline order (`renderer.ts:53-279`)

Exact paint order, top of `render()` downward (later = on top):

1. **Derive frame state** (`:54-79`): destructure `world`; compute `deck`/`deckIndex`,
   `hasNavigator`/`hasHelmsman`/`hasExpertNavigator` (crew-state scans),
   `timeOfDay = (time + world.dayTimeOffset) % SECONDS_PER_DAY`,
   `brightness = getShipBrightness(timeOfDay)`. Build `rc`.
2. **Clear** to solid water color `#1a5276` (`:81-82`).
3. **`drawWater`** (`:84`) — animated, uses *its own effective camera* `camera + waterOffset`
   so the sea scrolls independently of the ship.
4. **Crow's-nest pass** (`:96-110`, only when `deckIndex === 0` & >1 deck): draws upper deck +
   its corpses + its actors faintly, then a flat `rgba(0,0,0,0.45)` overlay to push it back.
5. **`drawDeck`** for the active deck (`:112`) (+ harbor tiles during docking approach).
6. **Darkness overlay** (`:118-134`) — combined night + deck-depth tint. **★ Primary hook for
   weather darkening — see §4.**
7. **Lantern glow** (`:136-159`) — additive `globalCompositeOperation = 'lighter'` radial
   gradients, drawn after darkness, before crew.
8. **Corpses** on this deck (`:161-164`) via `drawCorpse`.
9. **Selected-object highlight** — yellow tile outline (`:166-173`).
10. **Actors pass 1** (`:175-179`) — `drawActor` for every crew on `deckIndex` (bodies).
11. **Actors pass 2** (`:181-185`) — `drawActorOverlays` (speech/thought bubbles, name labels)
    so labels never hide behind a later-drawn body.
12. **`drawUI`** (`:187`) — deck selector + crew/object panel.
13. Corpse panel (`:188-191`), **`drawCompass`** (`:192-194`), settings button/sound button
    (`:195-199`), **`drawActivityLog`** (`:200-202`), **`drawTooltip`** (tile hover, `:203`).
14. **`drawContextMenu`** (`:204-206`), command input (`:207-209`), **`drawMapOverlay`**
    (full-screen map, `:210-212`).
15. **Deferred tooltips** (`:213-218`) — item tooltip then bar tooltip (topmost UI).
16. **Dock button / docked bar** (`:220-228`).
17. **Mutiny banner / game-over overlay** (`:230-276`) — full-screen pulsing banner + skull
    screen. This is the precedent for any **full-screen end-state / alert overlay**.
18. `this.hoveredItem = rc.hoveredItem` (`:278`) — persisted so `getHoveredItem()` can feed it
    back into `update()` next frame.

**To insert a new full-screen FX (rain sheet, flash, vignette):** add it at the right depth.
Below crew/UI → put it near step 6/7 (world-space FX). Above everything (lightning flash,
fade-to-black) → put it after step 15 but typically before mutiny overlays (step 17), matching
the existing `ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT)` pattern.

---

## 4. Day/Night brightness & the darkness overlay (★ weather hook)

### Brightness source — `getShipBrightness(timeOfDay)` (`types.ts:21-27`)
Piecewise-linear, returns `0.3..1.0` (`NIGHT_BRIGHTNESS = 0.3`, `types.ts:15`):
- `< DAY_START (60)`: ramp up from 0.3 (dawn).
- `DAY_START..DUSK_START (60..420)`: `1.0` (full day).
- `DUSK_START..NIGHT_START (420..480)`: ramp down to 0.3 (dusk).
- `≥ NIGHT_START (480)`: `0.3` (night).

`brightness` is read-only in the renderer and also flows into `RenderContext.brightness` for
the morale tooltip (`panels.ts:243`, "Night: Fear/Brave").

### The darkness/tint block — `renderer.ts:118-134`
This is the single place a global dark tint is applied. There is **no separate storm field
today** (grep confirms: no `storm`/`weather`/`lightning` anywhere in `src/`). The block:

```ts
const nightDark  = (1 - brightness) / (1 - NIGHT_BRIGHTNESS);   // 0 at day, 1 at night
const nightAlpha = Math.max(0, nightDark * 0.55 - lanternLift); // lanterns lift darkness
const deckAlpha  = deckIndex > 0 ? 0.125 * deckIndex : 0;       // lower decks darker
const totalAlpha = Math.min(0.75, nightAlpha + deckAlpha);
if (totalAlpha > 0) {
  ctx.fillStyle = `rgba(0, 0, 20, ${totalAlpha})`;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
```

`lanternLift = Math.min(0.35, litCount * 0.07)` where `litCount` = lit lanterns on this deck.

### Recipe: storms darken further + lightning flash to 1.0
1. Add weather state to `World` (e.g. `world.weather: { intensity: number; flash: number }`),
   ticked in `update()` / `game.ts` (renderer must stay read-only — never mutate `world` here).
2. Pass it into `RenderContext` (add a `weather` field in `context.ts`), set it in the `rc`
   literal at `renderer.ts:69`.
3. **Darken:** in the `:118-134` block, add storm contribution before the clamp, e.g.
   `const stormAlpha = rc.weather.intensity * 0.4;` then
   `const totalAlpha = Math.min(0.85, nightAlpha + deckAlpha + stormAlpha);`
   (raise the clamp ceiling if you want storms darker than the current 0.75 cap).
4. **Lightning flash:** a flash is the inverse — a bright white full-screen rect whose alpha
   spikes to ~1.0 and decays. Draw it **after** the world/crew but you can choose above or
   below UI. Pattern (put near step 15, before mutiny overlays):
   ```ts
   if (rc.weather.flash > 0) {
     ctx.fillStyle = `rgba(255,255,255,${Math.min(1, rc.weather.flash)})`;
     ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
   }
   ```
   Drive `flash` 1.0→0 in the update step. The mutiny banner uses
   `const pulse = 0.6 + 0.4 * Math.sin(time * 4)` (`renderer.ts:236`) as the precedent for
   time-driven oscillation if you want flicker.
5. **Rain sheet:** a world-space animated overlay belongs near step 6/7 (so crew/UI sit on
   top). Use `time` for animation phase like `drawWater` does (`tiles.ts:18`,
   `phase = Math.floor(time * 0.5) % 2`). For diagonal streaks, offset by `camera` so rain
   feels attached to the world, or ignore camera for screen-space rain.

**Gotcha:** always save/restore `ctx.globalCompositeOperation` if you use additive blending —
the lantern-glow block does this (`renderer.ts:138-158`, `tiles.ts:78-88`). Forgetting it
corrupts every subsequent draw that frame.

---

## 5. Actors — `drawActor` / `drawActorOverlays` / `drawCorpse` (`actors.ts`)

### Sprite selection (`drawActor`, `actors.ts:5-101`)
- Screen pos: `sx = member.pixelX - camera.x`, `sy = member.pixelY - camera.y`. Sprites are
  **center-anchored** (drawn at `sx - size/2`, `sy - size/2`), unlike tiles (top-left anchored).
- Directional sprite picked by `member.facing` (`north`/`west`/`south`; **east reuses west
  flipped** via `ctx.scale(-1,1)`, `:21-28` + `:35-40`).
- Humans use `sprites.crew[profile.spriteIndex % crew.length]`; animals use
  `sprites.animals.get(actorType)` (`:15-17`).

### Scale (`actors.ts:31`) — precedent for new sized actors
```ts
const sizeScale = (member.actorType === 'monkey' || member.actorType === 'cat') ? 0.7
                : isAnimal ? 0.85 : 1.0;
const size = TILE_SIZE * sizeScale;
```
`cat` and `monkey` render at **0.7×**, other animals at 0.85×, humans at 1.0×. There is a
**baby 0.6× precedent** referenced in the task — note it is **not in this current `actors.ts`**
(the live code only has 0.7/0.85/1.0). To add a baby/scaled variant, extend this ternary (gate
on `actorType` or a status/condition). `drawCorpse` has a parallel scale at `:229` (only
checks `monkey` 0.7 — **keep the two in sync if you add a scaled type**).

### Sprite vs colored-rectangle fallback (`actors.ts:34-61`)
If `sprite` is truthy → `drawImage`. Else fallback: shadow ellipse + filled circle in
`member.profile.color` (radius 10 human / 7 animal / 6 monkey). **Every sprite lookup must
tolerate `sprites === null`** (sprites load async). This fallback pattern repeats everywhere
(tiles `tiles.ts:91-106`, items `widgets.ts:221-229`, object panel `panels.ts:302-308`).

### State indicator glyphs (`actors.ts:72-100`)
A single char drawn at `sx+14, sy-12` per `CrewState` (z=sleep, ~=eat, ♥=kiss/copulate, ♪=sing
etc.). **To show a new state visually**, add a `CrewState` case here.

### Overlays — second pass (`drawActorOverlays`, `actors.ts:104-154`)
Speech bubble (priority) → thought bubble → name label. Bubble sprite via
`sprites.bubbles.get(member.thoughtBubble)` with a hand-drawn fallback. NPC role appended to
name from `member.statuses.get('npc')`. Drawn in a **separate loop** (`renderer.ts:181-185`)
after all bodies — keep this two-pass split when adding head-mounted UI (HP rings, status
icons) so they never get painted under a neighbouring actor.

### The WOBBLE effect (drunk → reuse for storm-stumble / seasickness)
**Important:** wobble is **not** a render effect. It lives in the AI/movement layer and
displaces the actor's actual `pixelX/pixelY` (the renderer just draws wherever the actor is).
Two distinct mechanisms:

1. **Pathfinding wobble** — `src/crew/movement.ts:134-151`. On reaching a path node, drunk
   (25% chance) / tipsy (8%) crew unshift a perpendicular detour tile onto their path:
   ```ts
   const wobbleChance = member.conditions.has('drunk') ? 0.25
                      : member.conditions.has('tipsy') ? 0.08 : 0;
   ```
2. **Idle/dance jitter** — `src/crew/update.ts:618-645`, sinusoidal `pixelX/pixelY` drift
   (`const wobble = (drunk ? 15 : 8) * (...)`).

**Recipe for storm-stumble / seasickness:** add a condition (e.g. `'seasick'`, `'storm_tossed'`)
in `crew/update.ts` `refreshConditions()` (derive from `world.weather` + position on deck),
then extend the `wobbleChance` ternary in `movement.ts:136` and/or the jitter amplitude in
`update.ts:620`. **Do not** try to add wobble in the renderer — the renderer is pure and reads
`member.pixelX` only. (If you ever want a *visual-only* shake decoupled from pathing, that would
be a new render-time `ctx.translate` in `drawActor`, but it would desync the click-hit position
which is computed from `pixelX/pixelY` in `input.ts`.)

---

## 6. UI: panels, widgets, tooltips

### Layout conventions
- Top-left: deck selector (`drawUI`, `ui/index.ts:22-42`) at `(10,10)`, width 160. Compass sits
  to its right at `x = 10 + 160 + 8` (`widgets.ts:118`).
- Top-right: crew/object/corpse panel, all anchored `px = CANVAS_WIDTH - 210, py = 10, pw = 200`
  (`panels.ts:13,30,...`). Only one shows at a time (selection is exclusive).
- Bottom-left: settings cog `(8, H-32)` + sound buttons just right of it (`widgets.ts:9-13`,
  `:253-257`).
- Bottom-right: activity log `(W-328, H-...)` (`widgets.ts:96-97`).

### `drawBar` — the reusable meter (`widgets.ts:194-200`)
`drawBar(rc, x, y, w, h, fill0to1, color)` → grey track + colored fill, auto-clamped. Used for
hunger/energy/morale/drunk/lust/health (`panels.ts:88-137`) and object HP / lantern oil
(`panels.ts:320,365`). **This is the building block for an HP bar / gold bar / contract
progress bar.**

### Recipe A: add a stat bar to the crew panel (`panels.ts:layoutCrewPanel`)
`layoutCrewPanel(rc, member, draw)` is a **measure-or-draw** function: called once with
`draw=false` to compute height, once with `draw=true` to paint (`panels.ts:11-25`). It
advances a running `y` cursor. To add a bar:
1. Add a block following the Drunk/Lust pattern (`:122-140`): guard with `if (draw) { label +
   drawBar(...) }` then `y += 20;` (advance the cursor **outside** the `if(draw)` so height
   measurement matches drawing — this is the key invariant; mismatched advances clip the panel).
2. For a hover tooltip on the bar, set `rc.hoveredBarTooltip = [...]` when `mousePos` is inside
   the bar rect (see morale, `:113-118`); the renderer draws it last.

### Recipe B: add a brand-new HUD widget (weather indicator, gold counter, combat UI)
1. Write `drawX(rc, ...)` in `src/render/ui/widgets.ts` (or a new file under `render/`), taking
   `rc` first. Use absolute screen coords; pick a corner that doesn't collide (see layout map
   above). Follow the panel idiom: `ctx.fillStyle='rgba(0,0,0,0.7)'; fillRect; stroke '#666'`.
2. Export it from `src/render/ui/index.ts` (and it's re-exported via `render/index.ts`).
3. Call it from `renderer.ts:render()` at the right pipeline depth (HUD → after `drawUI`,
   around `:195`). Pass whatever `world.*` field it needs as an argument (renderer destructures
   `world` at `:54`).
4. If it needs new data, add the field to `World` and populate it in `game.ts`/`update()`.
   Renderer never mutates `world`.
5. **Clickable HUD?** Add a hit-test helper next to the draw fn (precedent: `isDockButtonClicked`
   / `isLeaveHarborClicked` in `docking.ts:53,121`) and call it from `src/input.ts`. The render
   fn typically also takes `mousePos` to draw a hover state (see `drawDockButton`).

### Recipe C: contract list / multi-row scrolling panel
Model it on `drawMapOverlay` (`render/map.ts`) for a full-screen modal, or on the activity log
(`widgets.ts:88-110`) for a small bottom-corner list. The activity log shows the row idiom:
`entries.slice(-maxLines)`, `lineH`, per-row alpha fade. There is no scrollbar widget yet —
you'd add one. Modals are gated by a `world.*Open` boolean (mirror `mapOverlayOpen`,
`settingsOpen`) and drawn near step 14.

### Item slots & item tooltips
`drawItemSlot(rc, x, y, size, item|null)` (`widgets.ts:202-251`) draws one inventory cell:
sprite via `sprites.items.get(item.name.toLowerCase().replace(/ /g,'_'))` (cropped to inner 60%
of the 1024² source), quantity badge, and **sets `rc.hoveredItem` on hover** → renderer shows
`drawItemTooltip` last. Reuse this for any item grid (it's already used by crew panel, object
panel, corpse panel, and the barrel grid in the context menu).

---

## 7. Tiles & tile overlays (tentacles / damage cracks / treasure-X)

### `drawDeck` (`tiles.ts:46-109`)
Per tile: skip `WATER`; cull off-screen (`:56`); screen pos `sx = x*TILE_SIZE - camera.x`
(**top-left anchored**, tiles are not centered). If a sprite exists, transparent furniture gets
a `FLOOR` sprite drawn underneath first (`needsFloorUnder`, `:60-69`). Lanterns get an additive
glow if oil>0 (`:73-89`). No sprite → `TILE_COLORS[tile]` fill + `drawTileIconFallback` hand-art
(`:111-362`, a big `switch` over `TileType`).

### Recipe: per-tile overlay (damage cracks, treasure-X, tentacle on a tile)
There is **no existing per-tile overlay layer** — `OBJECT_MAX_HP` exists (`types.ts:88`) but the
object panel currently draws HP as a hardcoded full bar (`panels.ts:320` passes `1.0`); actual
per-tile damage state is not yet stored. To add tile overlays:

1. **Store per-tile state** in a `Map<string, T>` keyed `"deck-x-y"` (the established pattern —
   see `lanternOil` and `barrelInventory`, both keyed exactly this way; lantern key built at
   `tiles.ts:74` `\`${rc.deckIndex}-${x}-${y}\``). E.g. `world.tileDamage: Map<string, number>`.
2. **Thread it through `RenderContext`** (add field in `context.ts`, set in `renderer.ts:69`) —
   the same way `lanternOil` reaches `drawDeck`.
3. **Draw the overlay inside `drawDeck`** right after the base tile is painted (after
   `tiles.ts:71`/`:106`), using `sx, sy` already in scope:
   ```ts
   const dmg = rc.tileDamage.get(`${rc.deckIndex}-${x}-${y}`) ?? 0;
   if (dmg > 0) { /* draw cracks at sx,sy,TILE_SIZE */ }
   ```
   Mirror the lantern-glow inline block as your template. The lit-lantern glow is the existing
   precedent for "extra art on top of a specific tile."
4. **World-space markers not tied to the tile grid** (a treasure-X on the map, a tentacle
   spanning several tiles, a kraken) are better drawn as their own pass in `renderer.ts` between
   the deck draw (step 5) and crew (step 10), iterating a `world.*` list and converting world→
   screen with `x*TILE_SIZE - camera.x`. This avoids the per-tile cull/floor-underlay logic and
   lets a sprite exceed one tile. The selected-object yellow outline (`renderer.ts:166-173`) is
   the minimal precedent for "draw a marker at a tile position outside `drawDeck`."
5. The map overlay's treasure/island markers live in `render/map.ts` (`drawMapOverlay`) — that
   is where a **map-screen** treasure-X belongs, not the deck view.

**Camera→screen transform (memorize):**
- Tiles & world markers (top-left anchored): `screenX = worldTileX * TILE_SIZE - camera.x`.
- Actors/corpses (center anchored): `screenX = actor.pixelX - camera.x` (then offset by
  `-size/2` when drawing the image).
- Water only: uses `camera + waterOffset` (`tiles.ts:11-13`) so it parallax-scrolls.
- Screen→world (for hit-testing, `tooltips.ts:11-14`): `tileX = floor((mouse.x + camera.x)/TILE_SIZE)`.

---

## 8. Invariants & gotchas checklist
- **Renderer is pure**: never mutate `world` inside `render()` / `draw*`. State changes belong
  in `update()`/`game.ts`. (Wobble, weather decay, damage = update-side.)
- **Always null-check `rc.sprites`** and `sprites.*.get(...)` — sprites load async; provide a
  fallback (every existing draw fn does).
- **Save/restore `globalCompositeOperation`** around any `'lighter'`/additive blend.
- **Measure-or-draw panels** (`layoutCrewPanel`): advance the `y` cursor identically in both
  passes or the panel background clips.
- **Two-pass actors**: bodies then overlays — don't merge them.
- **Tooltips draw last** via the `rc.hoveredItem` / `rc.hoveredBarTooltip` out-channels; add new
  hover tooltips the same way rather than drawing inline.
- **Scale ternaries in two places**: `drawActor` (`actors.ts:31`) and `drawCorpse` (`:229`) —
  keep in sync for any new sized actor type.
- **Keys are `"deck-x-y"`** strings for all per-tile maps (`lanternOil`, `barrelInventory`).
- Clickable canvas UI needs a matching hit-test in `input.ts` (no DOM event targets — it's one
  `<canvas>`).
