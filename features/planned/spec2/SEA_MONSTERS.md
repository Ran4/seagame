# Sea Monsters & Kraken Encounters

The ultimate "oh no" moment. Unlike ship combat (tactical), monster encounters are pure survival horror. Tentacles reaching over the railing, crew scrambling to cut them — this is cinema.

## Design

### Encounter Trigger
- Rare random event while sailing in deep water (far from islands).
- Visual foreshadowing: water darkens, fish sprites appear fleeing, lookout shouts a warning.
- 30 seconds to prepare before attack begins.

### Kraken Attack Phases
1. Tentacles appear at ship edges. Crew must hack them with cutlasses (new "Fight" action at tentacle tiles). Each tentacle has HP.
2. Tentacles grab specific crew members — others must free them before they're dragged overboard.
3. Kraken rams the hull — massive damage to one side.
4. Retreats if enough tentacles are severed, or the ship sinks.

### Crew Behavior
- Brave crew (high morale) run to fight tentacles. Cowardly crew (low morale) flee below deck.
- Dogs bark at tentacles. Parrots fly circles overhead.

### Loot
- Kraken ink (valuable trade good), kraken tooth (legendary weapon), tentacle meat (food).
- Crew who fought get "Kraken Slayer" status — permanent morale bonus and conversation topic.

### Other Monsters
- Sea serpents: fast, hit-and-run attacks on hull.
- Ghost ships: drain morale, can't be fought — must outrun.
- Mermaids: lure crew overboard if morale/attraction is low.

## Implementation Notes

Depends on hull damage system from combat/storms. Tentacles are temporary tile overlays with HP. The "Fight" action is a new command similar to "Man Cannon". Monster encounters are world-level events triggered by a random roll during sailing.
