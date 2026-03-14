import { Actor, Corpse, CrewState, World } from '../types';
import { stopConversation } from '../conversation';

export function killActor(world: World, actor: Actor): void {
  // Create corpse from actor data
  const corpse: Corpse = {
    actorId: actor.id,
    name: actor.profile.name,
    actorType: actor.actorType,
    pixelX: actor.pixelX,
    pixelY: actor.pixelY,
    deck: actor.deck,
    spriteIndex: actor.profile.spriteIndex,
    color: actor.profile.color,
    sex: actor.profile.sex,
    inventory: actor.profile.inventory,
  };
  world.corpses.push(corpse);

  // Deselect if selected
  if (world.selectedActorId === actor.id) {
    world.selectedActorId = null;
    world.contextMenu = null;
  }

  // End conversation partner's conversation
  if (actor.state === CrewState.TALKING || actor.conversationPartnerId !== null) {
    stopConversation(actor, world.actors);
  }

  // Free copulation partner
  if (actor.copulationTarget?.type === 'crew') {
    const partnerId = (actor.copulationTarget as { type: 'crew'; actorId: number }).actorId;
    const partner = world.actors.find(c => c.id === partnerId);
    if (partner) {
      partner.state = CrewState.IDLE;
      partner.idleTimer = 1 + Math.random() * 2;
      partner.copulationTarget = null;
    }
  }

  // Remove actor from world
  const idx = world.actors.indexOf(actor);
  if (idx !== -1) world.actors.splice(idx, 1);

  // Remove dead actor's entry from every surviving actor's relations
  for (const surviving of world.actors) {
    const relIdx = surviving.relations.findIndex(r => r.actorId === actor.id);
    if (relIdx !== -1) surviving.relations.splice(relIdx, 1);
  }

  world.activityLog.push({ text: `${actor.profile.name} has died`, time: world.time });
}

export function checkDeath(world: World, actor: Actor): boolean {
  if (actor.health <= 0) {
    killActor(world, actor);
    return true;
  }
  return false;
}
