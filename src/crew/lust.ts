import { Actor, CrewState, Deck, TILE_SIZE } from '../types';
import { orderCrewToAdjacentTile, orderCrewBesideTile } from './movement';

const LUST_SEEK_COOLDOWN_MIN = 30;
const LUST_SEEK_COOLDOWN_MAX = 60;

export function trySeekLustPartner(member: Actor, crew: Actor[], decks: Deck[]): boolean {
  // Find best partner on same deck by highest mutual attraction score
  let bestPartner: Actor | null = null;
  let bestScore = -1;
  for (const other of crew) {
    if (other.id === member.id) continue;
    if (other.deck !== member.deck) continue;
    if (other.actorType !== member.actorType) continue; // same species only
    if (other.state === CrewState.COPULATING || other.state === CrewState.KISSING) continue;
    const myRel = member.relations.find(r => r.actorId === other.id);
    const theirRel = other.relations.find(r => r.actorId === member.id);
    if (!myRel || !theirRel) continue;
    const score = myRel.attraction + theirRel.attraction;
    if (score > bestScore) {
      bestScore = score;
      bestPartner = other;
    }
  }
  if (!bestPartner) {
    member.lustSeekCooldown = LUST_SEEK_COOLDOWN_MIN + Math.random() * (LUST_SEEK_COOLDOWN_MAX - LUST_SEEK_COOLDOWN_MIN);
    return false;
  }

  const myRel = member.relations.find(r => r.actorId === bestPartner!.id)!;
  const theirRel = bestPartner.relations.find(r => r.actorId === member.id)!;

  // Threshold modifiers: lustful halves, drunk halves again
  const memberDrunk = member.conditions.has('drunk');
  const memberTipsy = memberDrunk || member.conditions.has('tipsy');
  const partnerDrunk = bestPartner.conditions.has('drunk');
  const bothDrunk = memberDrunk && partnerDrunk;
  const eitherDrunk = memberDrunk || partnerDrunk;
  const eitherTipsy = memberTipsy || partnerDrunk || bestPartner.conditions.has('tipsy');

  // Base thresholds (same as game.ts menu)
  let kissThreshold = eitherDrunk ? 32 : eitherTipsy ? 48 : 64;
  let copThreshold = bothDrunk ? 64 : eitherDrunk ? 80 : 128;
  // Lustful halves thresholds
  kissThreshold = Math.floor(kissThreshold / 2);
  copThreshold = Math.floor(copThreshold / 2);

  // Determine interaction type
  let targetState: CrewState;
  const bothLustful = member.conditions.has('lustful') && bestPartner.conditions.has('lustful');
  if (bothLustful && myRel.attraction >= copThreshold && theirRel.attraction >= copThreshold) {
    targetState = CrewState.COPULATING;
  } else if (myRel.friendship >= kissThreshold || myRel.attraction >= kissThreshold) {
    targetState = CrewState.KISSING;
  } else {
    member.lustSeekCooldown = LUST_SEEK_COOLDOWN_MIN + Math.random() * (LUST_SEEK_COOLDOWN_MAX - LUST_SEEK_COOLDOWN_MIN);
    return false;
  }

  // Interrupt busy target
  if (bestPartner.state === CrewState.TALKING) {
    // Reset conversation partner too
    const convPartner = crew.find(c => c.id === bestPartner!.conversationPartnerId);
    if (convPartner && convPartner.state === CrewState.TALKING) {
      convPartner.state = CrewState.IDLE;
      convPartner.idleTimer = 1 + Math.random() * 2;
      convPartner.conversationPartnerId = null;
      convPartner.speechBubbleText = null;
      convPartner.speechBubbleTimer = 0;
    }
    bestPartner.conversationPartnerId = null;
    bestPartner.speechBubbleText = null;
    bestPartner.speechBubbleTimer = 0;
  }
  // Set target to idle and clear their path
  bestPartner.state = CrewState.IDLE;
  bestPartner.path = [];

  // Set copulation targets on both
  member.copulationTarget = { type: 'crew', actorId: bestPartner.id };
  bestPartner.copulationTarget = { type: 'crew', actorId: member.id };
  bestPartner.idleTimer = 999; // freeze target

  // Pathfind initiator to target
  const targetTile = { x: Math.floor(bestPartner.pixelX / TILE_SIZE), y: Math.floor(bestPartner.pixelY / TILE_SIZE), deck: bestPartner.deck };
  let success: boolean;
  if (targetState === CrewState.KISSING) {
    success = orderCrewBesideTile(member, targetTile, decks, targetState);
  } else {
    success = orderCrewToAdjacentTile(member, targetTile, decks, targetState);
  }

  if (!success) {
    // Clean up on pathfinding failure
    member.copulationTarget = null;
    bestPartner.copulationTarget = null;
    bestPartner.idleTimer = 1 + Math.random() * 2;
    member.lustSeekCooldown = 10; // short cooldown on failure
    return false;
  }

  member.lustSeekCooldown = LUST_SEEK_COOLDOWN_MIN + Math.random() * (LUST_SEEK_COOLDOWN_MAX - LUST_SEEK_COOLDOWN_MIN);
  return true;
}
