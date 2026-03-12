# Item Spoilage

Items have `spoilAfter` (seconds) and `createdAt` fields in `types.ts`, but nothing currently checks them. Perishable items (e.g. Semen, spoilAfter: 3600s) sit in barrels/inventories forever.

## Implementation

- In the game update loop, iterate barrel inventories and actor inventories
- Remove items where `gameTime - item.createdAt >= item.spoilAfter`
- Activity log entry: "{item} has spoiled" (note: this will spam the log, so we need to start adding log
  level, this should probably be log level DEBUG while other things should be INFO or something?)
- Consider a visual cue (greyed-out sprite, smell lines) for items close to spoiling

## Open questions

- Should spoiled food cause sickness if eaten?
- Should there be a "preserved" status (salted meat, pickled items) that extends or removes spoilage?
