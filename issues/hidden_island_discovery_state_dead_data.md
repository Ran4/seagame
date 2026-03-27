# Hidden-island discovery state is mostly dead data

The game tracks `spottedIslands` and updates it from lookout spotting and notice-board reveals, but the actual world-map visibility logic does not use that state.

Right now hidden islands are still gated by "expert navigator present" checks in the map overlay and map click handler, so a discovered hidden island may still remain unusable on the map.

## Fix

Use `spottedIslands` as the real visibility/unlock state for hidden islands.

Expert navigation should help discover hidden islands faster or reveal them, not bypass the discovery state entirely.

Relevant code:
- `src/crew/update.ts` island spotting
- `src/notices.ts` notice-board reveal
- `src/render/map.ts` map overlay visibility
- `src/worldmap.ts` map click handling
