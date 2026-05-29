# Monkey Mischief

Idle monkeys (`actorType: 'monkey'`) periodically commit petty, comedic theft.
Low-stakes and emergent: nothing is destroyed, everything is recoverable.

## Behaviour

Implemented in `updateIdleAnimal()` (`src/crew/update.ts`), gated to adult monkeys
(`actorType === 'monkey' && !statuses.has('baby')`), via `tryMonkeyMischief()`.

Two phases driven by the `'thief'` status:

1. **Pinch** — when off cooldown and a small per-decision chance fires
   (`MISCHIEF_CHANCE = 1%`), the monkey steals **one** item:
   - First choice: an adjacent crew member's inventory (within `MISCHIEF_STEAL_RANGE = 1`
     tile, humans only, non-NPC). The victim gets a small morale dip
     (`MISCHIEF_VICTIM_MORALE_DIP = 8`) and a grumble speech bubble
     ("Where's me grog?!", "Oi! Me things!", ...).
   - Otherwise: a random barrel that currently holds loot.
   - Prefers "shiny" items (gems/gold/artifacts — `MISCHIEF_SHINY_ITEMS`) if present.
   - Never steals blocked items (`MISCHIEF_BLOCKED_ITEMS`, e.g. `Semen`).
   - Stolen item is held in the `'thief'` status payload `{ item, since, victimName? }`
     (not the monkey's inventory, so it won't be eaten/spoiled while carried).
   - The monkey shows a cheeky `'mischief'` thought bubble + a chatter speech bubble,
     plays the `monkey_mischief` SFX, and logs to the activity log.

2. **Carry & stash** — for `MISCHIEF_CARRY_TIME = 20s` the monkey scampers about
   (falls through to normal wandering) with the loot, flashing the cheeky bubble.
   Then `monkeyStashLoot()` deposits it into a **random barrel** (any deck; stacks
   merge), or — if no barrel is reachable — drops it (into the monkey's own inventory).
   The `'thief'` status is cleared and a cooldown begins
   (`'mischiefCooldown' { until }`, `MISCHIEF_COOLDOWN = 90s`).

## Identifiers added

- Status: `thief` (registered in the plan's identifier registry), `mischiefCooldown`.
- ThoughtBubble: `mischief` (fallback glyph `☺` in `render/actors.ts`; registered in
  `sprites.ts` `bubbleNames`).
- SFX name: `monkey_mischief` (registered in `audio.ts`; missing file is tolerated).

## Notes / future

- Babies do not thieve.
- Shiny-item preference is name-based so it works once Treasure Maps adds `createGem`
  etc.; no hard dependency on that feature.
- A future stash spot could be a dedicated "monkey hoard" tile rather than a random barrel.
