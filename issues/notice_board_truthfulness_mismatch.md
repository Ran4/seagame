# Notice board claims truthfulness while advertising systems that do not exist

`src/notices.ts` says notices should reference only things that actually exist in the game, but some notice text still implies systems or services that are not implemented in the current build.

This makes the world feel less trustworthy, because players can read the board as a promise of real affordances and then discover that the game cannot answer those expectations.

## Fix

Either:
- remove notices that imply unavailable systems, or
- implement small real versions of the advertised services

The notice board should stay strictly truthful until more harbor/economy systems exist.

Relevant code:
- `src/notices.ts`
- harbor interactions in `src/game.ts`
