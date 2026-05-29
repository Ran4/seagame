# Fishing: tie bite-time (and catch quality) to a fishing skill

Status: open / deferred

## Context

The fishing feature (`features/planned/2026-03-12_FISHING.md`, implemented) currently
uses a **flat random 15–60 second bite-time** for every crew member, regardless of who
is fishing. This is set in `src/crew/movement.ts` in the `updateWalking()` arrival-timer
block:

```ts
} else if (member.state === CrewState.FISHING) {
  // Bite time: random 15-60s. TODO: scale with a fishing skill once crew
  // skills exist (see issues/fishing-needs-crew-skill.md).
  member.stateTimer = 15 + Math.random() * 45;
}
```

## What to do once crew skills (`features/planned/2026-03-12_CREW_SKILLS.md`) land

1. Add a `fishing` skill to `member.skills` (humans). Other skills already accumulate in
   the `updateActors()` state cases (e.g. `member.skills.cooking += 4` on EATING). Grant
   fishing skill on a successful catch in the `CrewState.FISHING` completion case in
   `src/crew/update.ts`.
2. Scale the bite-time down with skill: e.g.
   `base * (1 - 0.5 * skill/255)` so a master angler (skill ≥ `SKILL_MASTERY` = 192)
   waits roughly half as long. Halve again at mastery, like `CANNON_DURATION` does in
   `movement.ts`.
3. Optionally let higher fishing skill improve the odds of rare/valuable catches
   (swordfish, tropical) in `pickFishKind()` in `src/crew/update.ts`, and reduce the
   chance of catching a poisonous pufferfish (or let a skilled angler prepare it safely,
   skipping the `sick` status).

## Touch points

- `src/crew/movement.ts` — FISHING arrival timer (bite-time).
- `src/crew/update.ts` — `CrewState.FISHING` completion case (`pickFishKind`, reward,
  skill gain), `pickFishKind()` helper.
