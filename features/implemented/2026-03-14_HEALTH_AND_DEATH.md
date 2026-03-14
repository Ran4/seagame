# Health & Death System

Foundation for combat: per-actor health tracking, injury conditions, death with corpse spawning, and burial at sea.

## Health

Every actor has `health` and `maxHealth` fields directly on the Actor (not ActorProfile). Humans start at 100/100, animals at 50/50. Health does not decay autonomously — it is only reduced by external events (combat, future hazards). The health bar appears in the crew panel only when the actor is damaged (health < 99% of max), rendered in red above the hunger bar.

## Injured Condition

When health drops below 32, the `injured` condition is derived in `refreshConditions()`. Effects:
- **Movement speed reduced to 75%** of normal
- **Morale penalty of -40** applied to the morale drift target
- Shown in the morale tooltip as "Health: Injured"

## Death

When health reaches 0 or below, the actor is killed on the next tick via `checkDeath()` → `killActor()`. Death cleanup:
- A `Corpse` entity is created at the actor's position with their visual data (sprite index, color, sex, inventory)
- The actor is removed from `world.actors`
- If the actor was selected, selection is cleared and context menu closed
- If the actor was in a conversation, their partner's conversation state is cleaned up
- If the actor was copulating, their partner's copulation state is reset
- The dead actor's entry is removed from every surviving actor's `relations[]`
- An activity log entry is created

The update loop iterates actors in reverse to safely handle mid-loop removals.

## Corpses

Corpses are a separate entity type (`Corpse` interface on `World.corpses[]`), not a tile type. They overlay whatever tile they died on and do not block movement. Rendered after the darkness/glow layer but before living actors, at 60% alpha with the south-facing sprite rotated 90° (lying on side). Fallback rendering is a dark ellipse with an 'X'. Corpses also appear in the crow's nest ghost view for deck 1.

## Bury at Sea

Right-clicking a corpse with a human crew member selected shows a "Bury [name] at sea" menu item. The flow:
1. Crew pathfinds to the corpse position (`CARRYING_CORPSE` state, 2s pickup timer)
2. Corpse is removed from `world.corpses`
3. Crew pathfinds to the nearest hull-adjacent walkable tile
4. On arrival (`BURYING_AT_SEA` state, 3s toss timer), the burial completes and `carryingCorpseId` is cleared

If stopped mid-carry (via Stop command), the corpse is re-added to `world.corpses` at the carrier's current position. If no hull-adjacent tile is reachable after pickup, the corpse is also dropped.

## Debug State

`/api/state` now includes `health` and `maxHealth` in actor details, and `corpses` array in the top-level snapshot.

## Command Shorthand

`BuryAtSea <corpseActorId>` is available for order files.
