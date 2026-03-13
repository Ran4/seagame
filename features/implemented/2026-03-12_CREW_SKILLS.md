# Crew Skills & Progression

Makes every actor irreplaceable. When your best helmsman dies in a storm, it hurts not just emotionally but mechanically. Creates meaningful crew management decisions: assign your best fighter to guard duty or send them on the treasure expedition?

## Design

### Skill Categories
- **Sailing** (0-255): helm speed, storm resistance.
- **Gunnery** (0-255): cannon accuracy, reload speed.
- **Combat** (0-255): melee damage, defense.
- **Cooking** (0-255): food quality, hunger restore bonus.
- **Navigation** (0-255): map reading, course accuracy.
- Each starts random 10-60.

### Learning by Doing
- Skills improve through use: steering raises Sailing, firing cannons raises Gunnery, etc.
- Rate: varies depending on category. But for example, combat: +0.2 per in-game second of activity. navigating
  is a lot slower as some crew might spend half their time navigating.
- No XP menus, no level-up screens — quiet, organic growth discovered when checking crew stats.

### Skill Effects (at 192+)
- Sailing: can navigate storms without mast damage.
- Gunnery: double fire rate.
- Combat: ??? TBA leave an issue markdown file in issues/ that it's not implemented yet
- Cooking: meals restore +50% hunger.
- Navigation: reveals hidden islands on map.

### Traits
- Permanent traits assigned at creation or earned through events.
- SOME traits: "Eagle Eye" (better lookout range), "Iron Stomach" (immune to pufferfish), "Sea Legs" (no storm stumbling), "Berserker" (double combat when badly injured).
- Traits make each crew member unique and create attachment.

## Implementation Notes

Skills can be added to the Actor profile as a `skills: Record<string, number>` map. Increment in the relevant state handlers (e.g., in the STEERING case of updateActors, bump sailing skill). Skill effects are simple threshold checks in existing code paths. Traits use the existing status system.
