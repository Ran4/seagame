# Storms & Weather Events

Storms force crisis management without needing an enemy AI. They're visually spectacular and create emergent stories ("We barely survived the storm, but the mast broke and now we're drifting toward Skull Rock with no steering").

## Design

### Storm System
- Weather state on the world map: clear <-> cloudy <-> storm <-> clear.
- Storms move across the map. Some regions are stormier.
- Visual cues: darkening sky, increasing wave intensity, rain overlay, lightning flashes.

### Gameplay Effects
- Ship rocks — crew have % chance to stumble while walking (reuse drunk wobble code).
- Loose items slide across deck. Lanterns blow out.
- Sails can tear (mast damage). Water splashes onto deck (crew get "wet" status, move slower).
- Steering becomes harder (helmsman skill matters).

### Morale Interaction
- Storms tank morale. Low-morale crew may refuse orders, hide below deck, or pray.
- High-morale crew stay at posts.

### Lightning Strikes
- Rare but devastating. Can set mast on fire, injure crew on upper deck, or damage hull.
- Creates urgent "put out the fire!" moments.

### Duration
- 2-5 in-game hours (roughly 2-5 IRL minutes). Long enough to feel dangerous, short enough not to be tedious.

## Implementation Notes

The renderer already has a brightness system for day/night — storms can darken it further and add a rain particle overlay. The wobble/stumble mechanic is already implemented for drunk crew. Lightning is a flash effect (briefly set brightness to 1.0) plus a damage event. Most infrastructure exists; storms are largely tying existing systems together with a weather state machine.
