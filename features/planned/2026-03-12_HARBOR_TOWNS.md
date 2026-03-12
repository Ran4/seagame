# Harbor Towns & Trading

Islands currently exist on the world map but do nothing when you arrive. Harbor towns transform them into destinations with purpose. They close the gameplay loop: you fight to earn loot, sail to a harbor to sell it, recruit new crew to replace the fallen, buy supplies, and head back out. Without harbors, there's no economy and no reason to sail.

## Design

**Docking:** Navigate to an island and "dock" (new command). Ship anchors at a pier. Crew can disembark onto a harbor map — a small walkable area with buildings and NPCs. Alternatively, keep it simple: a menu-based interface that opens when docked.

**Tavern:** Crew can visit the tavern to drink (grog → drunk status), hear rumors (hints about treasure, storms, enemy ships), and get into bar fights (friendship -50 but +10 combat skill). Tavern visits boost morale significantly.

**Market:** Buy supplies: food (extends time between harbors), wood (for repairs), cannonballs (ammunition), grog (morale boost), medicine (heals injuries faster). Sell loot captured from enemy ships. Prices vary by island — creating trade routes.

**Recruitment:** Hire new crew at the tavern. Each recruit has randomized stats, traits, and a hiring cost. Some are skilled but expensive, others are cheap but troublesome (e.g., "drunkard" trait — automatically drinks any grog in barrels).

**Contracts:** Take delivery or escort missions from harbor NPCs. "Deliver cargo to Port Royal" or "Hunt the pirate ship Blacktide." Provides goals and narrative.

**Unique islands:** Each of the 7 islands has a personality: Tortuga is lawless (cheap crew, expensive goods), Port Royal is civilized (good prices, no pirates), Skull Rock has a black market (stolen goods only). This makes navigation strategic.

## Implementation Notes

Start with a menu-based harbor (no harbor map). When docked, right-clicking shows "Harbor" submenu with Buy/Sell/Recruit/Rumors. This leverages the existing context menu system. A gold/currency counter added to World state. Crew recruitment creates new Actor objects using the existing createActors factory pattern. The item system already supports barrel inventory — buying supplies just adds items to barrels.
