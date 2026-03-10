(Note: the code might have moved since the bug report was given).


## Fixed bugs

  Bug 1: Crash — Accessing deck index 2 when only 3 decks exist (off-by-one risk)

  game.ts — The grog seeding code used hardcoded decks[2]. Now uses decks.length - 1.

  Bug 2: beginConversation picks mood twice (nondeterministic positivity)

  conversation.ts — pickConversationScript now returns the mood alongside the script, and beginConversation reuses it instead of calling pickPartnerMood a second time.

  Bug 3: Stale copulationTarget used for non-copulation interactions

  The field copulationTarget is reused for kiss, pet, and converse interactions (not just copulation). When trySeekLustPartner checks if (other.copulationTarget) continue, it incorrectly skips actors who are just being petted or walking to a conversation. This prevents lustful actors from pursuing partners who are in innocent
  interactions.

  Bug 4: Barrel copulation available to dickless crew

  menu.ts:163-166 — Barrel copulation is gated only on sex !== 'M', but a male crew member with the 'dickless' status can still copulate with barrels. The conditions system tracks 'dickless' but the menu doesn't check it.

  Bug 5: stopConversation doesn't reset caller's conversationScript

  conversation.ts:264-276 — When stopConversation is called, the partner gets endConversation() (which clears conversationScript, conversationExchangesLeft, etc.), but the caller (member) only gets partial cleanup — conversationPartnerId, speechBubbleText, speechBubbleTimer, and conversationMyTurn are cleared, but
  conversationScript and conversationExchangesLeft are left stale. If the actor enters a new conversation, the stale conversationExchangesLeft could cause the script index calculation at line 258 to be wrong.

  Bug 6: Camera X axis has no clamping

  input.ts:81-82 — The camera Y is clamped but there's no clamping on camera.x at all. Players can scroll infinitely left or right into the void.

  Bug 8: Parrot pathfinding not used consistently

  crew folder — orderCrewTo always uses findPath (ground pathfinding). Parrots should use findPathFlying, but orderCrewTo/orderCrewToAdjacentTile/orderCrewBesideTile don't check actor type. Only wanderRandomly and the tired-parrot code use findPathFlying. This means player-ordered or command-system actions for parrots will
   fail if the path crosses hull/furniture tiles.


## WONTFIX
  Bug 7: Water scroll only goes downward regardless of heading

  game.ts:101-105 — The water offset only modifies y based on speed, ignoring currentHeading. The water always scrolls downward even if the ship is sailing east or north. It should use cos(heading) and sin(heading) to scroll both axes.

  Bug 10: Menu actor ID logic is inverted for interactions

  game.ts:204-206 — Theoretically, if selectedActorId becomes null between opening the context menu and clicking an item, the command silently fails. In practice this can't happen: any left-click that deselects an actor also closes the context menu, so the race condition is unreachable.

## PLANNED FEATURE

  Bug 9: Item spoilage is never checked

  types.ts:281 — Items have a spoilAfter field (e.g., Semen spoils after 3600s), but nothing in the codebase ever checks createdAt + spoilAfter against game time. Items never actually spoil.
