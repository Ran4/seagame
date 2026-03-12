# Ship-to-Ship Combat

The core action loop:
sail → encounter → fight → loot → repair → sail.

Every other system gains meaning when combat exists — eating matters because starving crew can't fight,
the helm matters because maneuvering is life or death.

## Design

### Encounters
- Random ship encounters while sailing. Enemy ship appears on world map, approaches if hostile.
- Probability increases near certain islands (trade routes, pirate waters).
- Player can flee if ship is faster.

### Combat Phase
- Ships broadside each other. Crew at cannons fire automatically.
- Rate of fire depends on crew skill (later! not now), hunger, energy. Each cannon has a cone of fire and a reload timer.
- Cannonballs can miss, hit hull (damage), or hit crew (injury/death).

### Hull Damage
- Ship tiles have HP. Damaged hull lets water in (flooding mechanic).
- Crew must patch holes (new "Repair" task at damaged tiles).
- Destroyed tiles become impassable rubble. Critical systems (helm, mast) can be disabled.

### Boarding
- When ships are adjacent, player can order crew to board via planks.
- LATER, but DO NOT implement now: Melee combat using cutlasses from inventory.
- Winning a boarding action captures the enemy ship's cargo.

### Consequences
- Crew can be injured (reduced stats, needs bed rest) or killed (permanent).
- Ship damage requires repair at harbor or with wood supplies.
- Captured loot goes to barrels.

## Implementation Notes

Start simple: enemy ships as a World-level entity with HP and crew count (no need to simulate their full AI). Cannon fire as a periodic damage roll. Boarding as a series of 1v1 stat comparisons. The existing command system can be extended with "Fire Cannon" and "Board Enemy" commands. The pathfinding system already handles multi-deck navigation, so crew walking to cannons is free.
