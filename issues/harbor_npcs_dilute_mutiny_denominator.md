# Harbor NPCs dilute the mutiny denominator

Mutiny threshold currently counts all human actors, including harbor NPCs.

When docked, this raises the number of mutineers required to trigger mutiny even though NPCs are not part of the crew and can never mutiny. With 4 real crew and 4 human harbor NPCs, the 60% threshold becomes 5 mutineers, which the actual crew can never reach.

## Fix

Mutiny logic should count only controllable, non-NPC human crew.

Relevant code:
- `src/crew/update.ts` mutiny detection
- `src/harbor.ts` harbor NPC creation
