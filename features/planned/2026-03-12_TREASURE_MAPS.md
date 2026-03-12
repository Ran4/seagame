# Treasure Maps & Exploration

Treasure hunting gives the game a goal-oriented layer on top of the sandbox. Finding a map creates a mini-quest: sail to the island, send crew ashore, dig for treasure. Makes the world map feel like a space of possibility.

## Design

### Treasure Maps
- Found in enemy ship loot or bought at markets.
- Each map points to a specific island with an X location. Some maps are fake (trap or empty).
- Maps are items stored in barrels or crew inventory.
- Using a map at the Map Table reveals the island name and adds a marker to the world map.

### Shore Expeditions
- When docked at the treasure island, send a crew party ashore.
- They disappear for 2-4 in-game hours and return with:
  - Treasure (gold, gems, artifacts)
  - Nothing (bad map)
  - Trouble (crew member injured by trap)
  - A new crew member (rescued castaway! maybe an animal friend too)
- Outcome depends on crew stats + random roll.

### Treasure Types
- Gold coins (currency), gems (high value, sell at harbors).
- Artifacts (unique items with lore).
- Cursed items (negative effects — "cursed" status: bad luck, lower morale, can't throw it away).
- Legendary weapons (named cutlasses with combat bonuses?).

### Exploration Discoveries
- Hidden coves (safe harbor, no fees).
- Abandoned ships (salvage for wood/cannons).
- Native villages (trade for exotic goods).
- Caves with clues to bigger treasures.

## Implementation Notes

Depends on harbor system for docking. Maps are a new item type. Shore expeditions are a timed event (send crew, wait, receive outcome). The world map already tracks islands — add a "treasure marker" overlay.
