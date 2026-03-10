(As things below are implemented, move them to REVIEW.md)

THINGS BELOW must be discussed first. Will they really be fun to add?

I want to implement a new feature, let's discuss it. Game design first (but do look at code to figure out roughly how to implement it).

--------------------------------------------------------------------------------

## Done

- Animals! They're just like crew members really. They walk around randomly. They too have hunger and energy etc. and they want to go to sleep and eat etc.
Difference is, the player can't command them to do stuff. You can however do things like select crewmember -> right click -> Interact ->  Pet.

- Implement this new status of crew members: Lust (0-255)
    * For men, ticks up over time (0.15 per second, so 0-255 in 1700 seconds ~2.361 days). start randomly between 0 and 128.
    * For women, it starts at randomly between 64 and 128. Then for 3 days it grows by 0.05 per second and
      then over the next 3 days reduces by 0.05 per second and so on.
    * Kissing ups lust by 20.
    * Condition "Lustful" if lust > 160.
    * High lust should drive crew to seek out high-attraction partners -
      would make copulation/kissing happen organically instead of only by player order.

- Crew conversations — idle crew near each other could talk (speech bubbles with procedural snippets), affecting friendship over time.

--------------------------------------------------------------------------------

## LATER

- Morale — derived from hunger/energy/relations. Low morale = slower work, mutiny risk. High morale = shanty singing.
- Death/injury — crew can get hurt in storms or combat. Beds could heal injuries too.
- Recruitment — hire new crew at harbor islands.

Sailing & world map:
- Ship-to-ship combat — enemy ships on the world map. Cannons (already crewable) actually fire. Damage to hull tiles.

- Fishing — new tile type (railing?), crew can fish to replenish food in barrels.
- Ship damage & repair — hull/furniture has HP already but nothing reduces it. Storms or combat could damage tiles, crew could repair them.
- Add a Brig/Cell — send misbehaving crew there?
- Arriving at islands — when the ship reaches a destination, show a port screen or at least a notification. Crew could disembark.
- Quality of life: Crew roster — a panel listing all crew with their status, accessible via hotkey.
