# Harbor Towns & Trading

Islands currently exist on the world map but do nothing when you arrive. Harbor towns close the gameplay loop: fight to earn loot, sail to a harbor to sell it, recruit new crew, buy supplies, head back out.

## Design

### Docking
- Navigate to an island and "dock" (new command). Ship anchors at a pier.
- Start with a menu-based interface that opens when docked (no harbor map needed initially).

### Tavern
- Crew can drink (grog → drunk status), hear rumors (hints about treasure, storms, enemy ships), get into bar fights (friendship -50 but combat skill boost).
- Tavern visits boost morale significantly.

### Market
- Buy: food, wood (repairs), cannonballs, grog, medicine.
- Sell: loot captured from enemy ships.
- Prices vary by island — creating trade routes.

### Recruitment
- Hire new crew at the tavern. Each recruit has randomized stats, traits, and a hiring cost.
- Some are skilled but expensive, others are cheap but troublesome (e.g., "drunkard" trait).

### Contracts
- Delivery or escort missions from harbor NPCs.
- "Deliver cargo to Port Royal" or "Hunt the pirate ship Blacktide."

### Unique Islands
- Each of the 7 islands has a personality: Tortuga is lawless (cheap crew, expensive goods), Port Royal is civilized (good prices, no pirates), Skull Rock has a black market.

## Implementation Notes

Start with a menu-based harbor (no harbor map). When docked, right-clicking shows "Harbor" submenu with Buy/Sell/Recruit/Rumors. Leverages the existing context menu system. Add a gold/currency counter to World state. Crew recruitment creates new Actor objects using the existing createActors factory. The item system already supports barrel inventory — buying supplies just adds items to barrels.
