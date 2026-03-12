# Crew Morale, Shanties & Mutiny

Morale is the meta-system that ties everything together. It gives the player a single number to optimize while all other systems (hunger, relationships, combat, storms) act as inputs. The ultimate threat: mutiny — the Dwarf Fortress tantrum spiral of cascading disaster.

## Design

### Morale Calculation
- Per-crew morale (0-255) derived from: hunger satisfaction (+), energy satisfaction (+), friendship with crewmates (+), recent combat victories (+), harbor visit recency (+), storm survival (+), loot share (+), friend death (-), injuries (-), storm damage (-), low food supplies (-), idle boredom (-).
- combat isn't implemented yet so thus no combat victory, but leave a comment in the codebase that we want to implement that later.
- Displayed as a colored bar in crew info panel.

### Shanty Singing
- When average morale >= 192 and 3+ crew are idle at night, they spontaneously gather and sing.
- Visual: crew cluster together, music notes appear.
- Audio: play a sea shanty mp3 file. Need to generate it using `ELEVENLABS_API_KEY`.
- Effect: +10 morale to all participants, +5 friendship between singers.
- The game's "everything is good" reward moment.

### Low Morale Effects
- Below 96: crew grumble (negative conversation snippets).
- Below 64: crew refuse non-essential orders (50% chance).
- Below 32: mutiny trigger.

### Mutiny
- When at least 60% of crew (rounded up, crew of 4 => 2.4 => 3) have morale < 32 simultaneously: they approach the captain and issue an ultimatum.
- Player has one in-game day (720 seconds) to raise morale (dock at harbor, distribute grog, share loot).
- If morale still critical after 24h: mutineers take over. Game over — but a glorious, story-worthy one.

### Grog as Morale Tool
- Drinking grog boosts morale by +20 but makes crew drunk. Strategic choice: happy but impaired, or sober but grumpy?
- The grog ration item already exists — just add a morale effect to drinking.

## Implementation Notes

Morale can be added as a new need (like hunger/energy) on each Actor.
The conditions system already supports derived states — add "happy", "content", "grumbling", "mutinous" conditions based on thresholds.

Shanty singing is a new group behavior in updateIdleHuman().

The conversation system already selects mood-based snippets — add "grumbling" and "mutinous" moods.
