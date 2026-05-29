# Harbor Towns & Trading

Islands currently exist on the world map but do nothing when you arrive. Harbor towns transform them into destinations with purpose. They close the gameplay loop: you fight to earn loot, sail to a harbor to sell it, recruit new crew to replace the fallen, buy supplies, and head back out. Without harbors, there's no economy and no reason to sail.

## Design


### Docking

**Docking:** When near an island, a menu pops up that allows us to press a button to dock
(disabled with a "No one is at the helm!" if no one is at the helm).

If clicked, we start a "docking minigame":
visually the boat just goes straight ahead and drives into the wharf.
Note: we can currently only see ~3 tiles to the north of the ship; that's fine.
We essentially can't see the dock until we're near it.

We can't partially dock; we need to go all the way then it'll say "Docking completed!".

**Visualization:**

Before:
```
_____WWWWWWWWWW
_____WWWWWWWWWW
_____WWW
_____WWW
_____WWW
_____WWW
_____WWW
_____WWW





        /\
        ||
        ||
```

**After the ship has fully sailed into the wharf:**

```
_____WWWWWWWWWW
_____WWWWWWWWWW
_____WWW
_____WWW/\
_____WWW||
_____WWW||
_____WWW||
_____WWW
```

note: right now the harbor we dock at is just _:s, but we later want that to be some
other tile type. And we do not add houses before docking is completed and and the dev
has accepted and tested it out.


### Disembarking

Once FULLY DOCKED:

Crew can disembark onto the harbor map — a small walkable area with buildings and NPCs.

**Tavern:** Crew can visit the tavern to drink (grog → drunk status), hear rumors (hints about treasure, storms, enemy ships), and get into bar fights (friendship -50 but +10 combat skill). Tavern visits boost morale significantly.

**Market:** Buy supplies: food (extends time between harbors), wood (for repairs), cannonballs (ammunition), grog (morale boost), medicine (heals injuries faster). Sell loot captured from enemy ships. Prices vary by island — creating trade routes.

**Recruitment:** Hire new crew at the tavern. Each recruit has randomized stats, traits, and a hiring cost. Some are skilled but expensive, others are cheap but troublesome (e.g., "drunkard" trait — automatically drinks any grog in barrels).

**Contracts:** Take delivery or escort missions from harbor NPCs. "Deliver cargo to Port Royal" or "Hunt the pirate ship Blacktide." Provides goals and narrative.

**Unique islands:** Each of the 7 islands has a personality: Tortuga is lawless (cheap crew, expensive goods), Port Royal is civilized (good prices, no pirates), Skull Rock has a black market (stolen goods only). This makes navigation strategic.

### Implementation Notes

Crew recruitment creates new Actor objects using the existing createActors factory pattern.

The item system already supports barrel inventory for now — buying supplies just adds items to barrels.
