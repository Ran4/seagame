# Current Plan

## Quick wins

* DONE: Enforce item spoilage: The infrastructure is already built (spoilAfter, createdAt). Just add a tick check in the game loop. Fish and semen spoil. Log it. Takes 30 minutes.

* DONE: Night fear: Crew with low morale lose extra morale at night if lanterns are unlit. Incentivizes the lantern system, which currently has no gameplay consequence.

* DONE: Lookout shouts: When the lookout crew spots an island approaching, show a speech bubble: "Land ho!" Currently lookout is a state but has no gameplay effect.

* DONE: Dog morale bonus: Crew who are friends with a dog get +5 morale when the dog is on the same deck. Dogs become strategically valuable, not just decoration.

# Later

### Priority Matrix

Ranked by the ratio of fun generated to implementation effort, considering how much existing infrastructure can be reused.

| Feature | Fun Factor | Effort | Priority |
|---------|-----------|--------|----------|
| Crew Morale & Shanties | 9/10 | Low | 1 — DO FIRST |
| Storms & Weather | 9/10 | Low | 2 — Reuses wobble/brightness |
| Ship-to-Ship Combat | 10/10 | Medium | 3 — Core gameplay loop |
| Fishing | 6/10 | Low | 4 — Quick win, food system |
| Harbor Towns (menu) | 8/10 | Medium | 5 — Closes the economy loop |
| Crew Skills | 7/10 | Low | 6 — Adds depth quietly |
| Sea Monsters | 9/10 | High | 7 — Spectacular but complex |
| Treasure Maps | 7/10 | Medium | 8 — Needs harbors first |

### Recommended Implementation Order

**Phase 1 — "The Crew Has Feelings":** Morale system + shanty singing + grog effects. This is low-effort, high-impact, and makes the existing crew AI dramatically more interesting without adding any new entity types or map features.

**Phase 2 — "Nature Is Cruel":** Storms + ship damage + crew injury/death. This introduces the concept of danger and loss, which gives morale real stakes. Uses existing brightness and wobble systems.

**Phase 3 — "Violence Is the Answer":** Ship combat + boarding + hull damage repair. The flagship feature. Depends on damage/injury from Phase 2.

**Phase 4 — "Civilization":** Harbor towns + trading + recruitment + fishing. Closes the gameplay loop. Crew who die in combat can be replaced. Supplies can be bought. Fish provide food at sea.

**Phase 5 — "Here Be Monsters":** Kraken + sea serpents + treasure maps. The spectacle features. By this point the game has enough systems for these to interact with richly.

* LATER: Drunk fights: Two drunk crew with low friendship who are near each other have a chance to start a fist fight. -20 friendship, both get "bruised" status. Comedy gold.

* Crew drowning: If a crew member somehow ends up on a water tile (knocked overboard in future storm), they lose energy rapidly and die if not rescued. A simple state check.

