# Baby Animal Generation Mechanics

Design notes for animal reproduction (dogs, monkeys, and potentially parrots).

## Pregnancy

After a successful copulation between two animals of the same type, the "mother" (one of the two, chosen arbitrarily or by some flag) gains a `'pregnant'` status with payload `{ father: actorId, since: number, animalType: ActorType }`.

Gestation periods (in-game days / IRL minutes):
- Dogs: 2 days (24 min IRL)
- Monkeys: 3 days (36 min IRL)

Pregnancy could be visible as a condition (tooltip: "pregnant") but probably not worth a sprite change for v1.

## Spawning

When the pregnancy is due (time since has reached maturity date. When that's? let's discuss! maybe 3 days?):
- Spawn a new actor of the same type at or adjacent to the mother's tile.
- If no walkable tile is available nearby, queue and retry next tick.
- The new actor starts as a "baby" (see below).
- Litter size: dogs could have 1-5 puppies (random), monkeys always 1.

## Baby State

Babies get a `'baby'` status (days <= 3 means baby status). While baby:
- Drawn at ~0.6x scale (scale factor on the sprite, or a dedicated smaller sprite).
- Growth period: 3 in-game days. After that, the `'baby'` status is removed -- they become a normal adult.
- Starting stats:
  - Hunger/energy: 200 (well-fed, well-rested at birth).
  - Friendship toward mother and father: 224 (very high).
  - Mother/father friendship toward baby: 192.
  - All other relations: initialized normally.
- No lust/attraction mechanics while baby status is active.

## Baby Behaviors

- Babies follow their mother with a tighter leash than normal dog-following behavior. If mother moves more than 2 tiles away, baby pathfinds to her immediately (vs the normal 4-5 tile threshold for dogs following owners).
- If mother is sleeping, baby idles nearby (within 1 tile).
- Babies eat more frequently (hunger decays ~1.5x faster) to represent growth.
- Babies do not participate in any work states (no manning cannons, no steering, no lookout).

## Population Control

Without limits, animals will breed endlessly. We could do:
- NO TO THIS ONE: Hard cap per type (e.g., max 6 dogs, 4 monkeys on the ship).
- Food pressure: more animals = faster barrel depletion. If food is scarce, animals get hungry and eventually... consequences. This is more emergent and Dwarf-Fortress-flavored.

But we just stick with implciit cooldown mechanic:
- Lust cooldown after birth.
  Upon birthing, we set status `postpartum { since: number }` (where number is the time of birth).
  Mother's lust is set to 0 whenever status postpartum is set at all.
  postpartum status is removed once it's been 4 days after `since`
  (so, minimum time between offspring is 4 days + 2-3 for new gestation = 6-7 days or once per 72-84 in-game minutes).

## Parrots / Egg Variant

SKIP THIS FOR NOW.

Parrots could use a different system:
- After copulation, mother produces an `egg` item placed on the nearest walkable tile (or in a barrel?).
- Egg has a hatch timer (2 in-game days).
- If the egg is on a tile with a crew member or parrot nearby for enough cumulative time, it hatches into a baby parrot.
- If neglected (no one nearby for a full day), egg despawns (failed hatch).
- This adds a small management element: crew or parrots need to "sit on" the egg.

## Name Generation

Puppies and baby monkeys get auto-generated names on spawn. Options:
- Dogs: short punchy names from a list (Rex, Pip, Salty, Bones, Biscuit, Plank, Scupper, Rigger, Grog, Noodle). Maybe pirate-themed but not always
- Monkeys: slightly exotic names (Mango, Coconut, Rascal, Jib, Tango, Bandit).
- Parrots: alliterative or rhyming (Polly, Squawkins, Crackers, Captain Beak).
- Pull from a pool, avoid duplicates with living actors.
