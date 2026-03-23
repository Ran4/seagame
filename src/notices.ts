import { World, SKILL_MASTERY } from './types';

// Notices reference only things that actually exist in the game.
// Dynamic notices are built from world state at read time.
function getNotices(world: World): string[] {
  const notices: string[] = [];

  // Static notices about known harbors
  notices.push('Tortuga has taverns and trade — a pirate\'s best friend.');
  notices.push('Port Royal is a fortified colonial port with a busy market.');
  notices.push('Palm Cove has fresh water — good for restocking.');
  notices.push('Blackwater Bay has shipwrights — deep natural harbor.');
  notices.push('Isla Muerta is shrouded in fog. No safe harbor there.');

  // Gameplay tips (all true mechanics)
  notices.push('Keep your crew fed and rested, or morale will plummet.');
  notices.push('A good lookout at the mast can spot islands from afar.');
  notices.push('Grog lifts spirits but clouds judgement — drink wisely.');
  notices.push('Lanterns keep the night fear at bay. Light them at dusk.');
  notices.push('A skilled navigator can chart courses to hidden places.');
  notices.push('Dogs on board boost crew morale — treat them well.');
  notices.push('Singing shanties at night lifts the whole crew\'s spirits.');

  // Dynamic notices based on world state
  const dockedIsland = world.docking.island;
  if (dockedIsland) {
    const otherHarbors = world.worldMap.islands.filter(i => i.hasHarbor && i.id !== dockedIsland.id);
    if (otherHarbors.length > 0) {
      const other = otherHarbors[Math.floor(Math.random() * otherHarbors.length)];
      notices.push(`Ships regularly sail between here and ${other.name}.`);
    }
  }

  const crewCount = world.actors.filter(a => a.actorType === 'human' && !a.statuses.has('npc')).length;
  if (crewCount < 4) {
    notices.push('CREW WANTED — The innkeeper knows sailors looking for work.');
  }

  return notices;
}

export function readNoticeBoard(world: World): void {
  // Pick 2-3 random notices
  const notices = getNotices(world);
  const count = 2 + Math.floor(Math.random() * 2);
  const shuffled = notices.sort(() => Math.random() - 0.5);
  world.activityLog.push({ text: '--- Notice Board ---', time: world.time });
  for (let i = 0; i < count && i < shuffled.length; i++) {
    world.activityLog.push({ text: shuffled[i], time: world.time });
  }

  // Chance to reveal a hidden island if crew has expert navigator
  const hasExpertNav = world.actors.some(c =>
    !c.statuses.has('npc') && c.actorType === 'human' &&
    (c.skills.navigation ?? 0) >= SKILL_MASTERY
  );
  if (hasExpertNav) {
    const hiddenIslands = world.worldMap.islands.filter(i => i.hidden);
    const unspotted = hiddenIslands.filter(i => !world.spottedIslands.has(i.id));
    if (unspotted.length > 0 && Math.random() < 0.5) {
      const island = unspotted[Math.floor(Math.random() * unspotted.length)];
      world.spottedIslands.add(island.id);
      world.activityLog.push({ text: `Your navigator notices a map pinned to the board — ${island.name} marked!`, time: world.time });
    }
  }
}
