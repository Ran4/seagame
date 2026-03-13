1. Add to `TileType` enum in `types.ts`
2. Add to `WALKABLE` set if crew can stand on it
3. Add color to `TILE_COLORS`
4. Add char mapping in `ship.ts` `CHAR_TO_TILE`
5. Place it in the deck ASCII layout
6. Add name to `TILE_NAMES` in `renderer.ts` (for tooltip)
7. Add sprite generation prompt in `scripts/generate-sprites.mjs`
8. Run `node scripts/generate-sprites.mjs` (skips existing sprites)
