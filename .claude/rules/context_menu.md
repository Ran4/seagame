Right-click opens a context menu with actions.

**Right-click a human crew member:**
- "Stop [action]" — shown if crew is busy (walking, eating, sleeping, steering, manning cannon)
- "Go to Upper/Lower Deck" — sends crew to the other deck via stairs
- "Interact ▶" — submenu with Converse/Kiss/Copulate (shown when another human is selected)

**Right-click an animal (with human selected):**
- "Interact ▶" → "Pet" (3s, +2 friendship both ways)

**Right-click a furniture tile (with crew selected):**
- Bed → "Sleep" (restores energy gradually, ~480s for full restore)
- Stove → "Eat"
- Helm → "Steer"
- Cannon → "Man Cannon"
- Stairs → "Go to stairs"
- Barrel → "Items ▶" (if barrel has items) + "Copulate" (males only)

**Barrel items submenu (3-level):** Right-clicking a barrel with a crew selected shows "Items ▶" → per-item entries (e.g. "Semen (x2) ▶") → "Take". Clicking "Take" pathfinds the crew to the barrel then transfers one unit to their inventory on arrival. Uses `TAKING_ITEM` crew state. Stackable items show quantity and decrement; non-stackable items are moved whole. Empty barrels have their inventory entry cleaned up. Barrel contents stored in `World.barrelInventory: Map<string, Item[]>` keyed by `"deck-x-y"`.

**Submenus (up to 3 levels):** `ContextMenuItem` supports `submenu?: ContextMenuItem[]`, nestable to 3 levels. Parent items show "▶" and open a flyout on hover. `handleMenuClick` checks deepest level first. Returns `undefined` (keep menu open) for submenu parents/disabled sub-items, vs `null` (close) for outside clicks. Disabled items (`disabled: true`) render grey and are not clickable. Level-3 panels edge-clamp (flip to left side if they'd overflow `CANVAS_WIDTH`). `ContextMenuItem` also supports `action?: string` and `itemData?: { barrelKey, itemName }` for non-state-based actions like taking items.

Actions defined in `TILE_ACTIONS` in `types.ts`. Menu rendered by `drawContextMenu()` in `renderer.ts`.
Escape or clicking outside closes the menu.
