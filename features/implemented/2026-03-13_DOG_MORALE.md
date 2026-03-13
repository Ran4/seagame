# Dog Morale Effects

Dogs affect crew morale in two ways: a deck-wide bonus for friendly dogs, and a proximity penalty for doghaters near unfriendly dogs.

## Friendly Dog Bonus

Any human crew member with a friendly dog (friendship >= 128) on the same deck gets +15 to their morale target. The dog can be anywhere on the deck — no distance limit. This is the "good boy on board" effect.

Tooltip: **Dog: Faithful friend ↑**

## Doghater Trait

~1% of human crew are assigned the `doghater` status at creation. Doghaters suffer a -15 morale target penalty when any non-friend dog (friendship < 128) is within 5 tiles (Euclidean) on the same deck.

Tooltip: **Dog: Despises hounds ↓↓**

## Interaction Between the Two

The bonus and penalty are independent and additive. A doghater who is friends with one dog but near an unfriendly dog gets +15 and -15, netting to 0. A doghater who has befriended all nearby dogs gets only the +15 bonus — befriending the dog "cures" the penalty for that specific dog.

## Implementation

- `doghater` status is assigned at actor creation with a 1% roll for humans.
- `getDogMoraleAdj()` computes the combined +15/-15 modifier, added to morale target alongside hunger/energy/friendship.
- `refreshConditions()` sets `near_friendly_dog` and `despises_nearby_dog` conditions each tick, used by the morale tooltip.

