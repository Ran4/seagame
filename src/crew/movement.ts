import { Actor, ActorType, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, CREW_SPEED, Item, LIGHT_LANTERN_DURATION, EXTINGUISH_LANTERN_DURATION, SKILL_MASTERY } from '../types';
import { findPath, findPathFlying } from '../pathfinding';
import { tryStartConversationWhileWalking, beginConversation } from '../conversation';

const EAT_DURATION = 8;
const STEER_DURATION = 999999;
const CANNON_DURATION = 15;
const LOOKOUT_DURATION = 30;
const NAVIGATE_DURATION = 999999;
const COPULATE_DURATION = 15;
const KISS_DURATION = 3;
const PET_DURATION = 3;

function currentTile(member: Actor): DeckPoint {
  return {
    x: Math.floor(member.pixelX / TILE_SIZE),
    y: Math.floor(member.pixelY / TILE_SIZE),
    deck: member.deck,
  };
}

function performTakeItem(member: Actor, barrelInventory: Map<string, Item[]>): void {
  const target = member.takeTarget;
  if (!target) return;
  member.takeTarget = null;
  const barrelItems = barrelInventory.get(target.barrelKey);
  if (!barrelItems) return;
  const idx = barrelItems.findIndex(i => i.name === target.itemName);
  if (idx === -1) return;
  const barrelItem = barrelItems[idx];
  if (barrelItem.stackable && barrelItem.quantity > 1) {
    const unitWeight = barrelItem.weight / barrelItem.quantity;
    barrelItem.quantity--;
    barrelItem.weight -= unitWeight;
    const existing = member.profile.inventory.find(i => i.name === barrelItem.name && i.stackable);
    if (existing) {
      existing.quantity++;
      existing.weight += unitWeight;
    } else {
      member.profile.inventory.push({ ...barrelItem, quantity: 1, weight: unitWeight });
    }
  } else {
    const [taken] = barrelItems.splice(idx, 1);
    const existing = member.profile.inventory.find(i => i.name === taken.name && i.stackable);
    if (existing) {
      existing.quantity += taken.quantity;
      existing.weight += taken.weight;
    } else {
      member.profile.inventory.push(taken);
    }
  }
  if (barrelItems.length === 0) {
    barrelInventory.delete(target.barrelKey);
  }
}

export function updateWalking(member: Actor, dt: number, crew: Actor[], brightness: number, barrelInventory?: Map<string, Item[]>, decks?: Deck[]): void {
  if (member.path.length === 0) {
    member.state = member.targetState;
    if (member.state === CrewState.EATING) {
      member.stateTimer = EAT_DURATION;
    } else if (member.state === CrewState.SLEEPING) {
      // No timer — sleeps until energy is full (rate-based)
    } else if (member.state === CrewState.STEERING) {
      member.stateTimer = STEER_DURATION;
    } else if (member.state === CrewState.MANNING_CANNON) {
      member.stateTimer = (member.actorType === 'human' && (member.skills.gunnery ?? 0) >= SKILL_MASTERY) ? CANNON_DURATION / 2 : CANNON_DURATION;
    } else if (member.state === CrewState.LOOKOUT) {
      member.stateTimer = LOOKOUT_DURATION;
    } else if (member.state === CrewState.NAVIGATING) {
      member.stateTimer = NAVIGATE_DURATION;
    } else if (member.state === CrewState.COPULATING) {
      member.stateTimer = COPULATE_DURATION;
    } else if (member.state === CrewState.KISSING) {
      member.stateTimer = KISS_DURATION;
    } else if (member.state === CrewState.LIGHTING_LANTERN) {
      member.stateTimer = LIGHT_LANTERN_DURATION;
    } else if (member.state === CrewState.EXTINGUISHING_LANTERN) {
      member.stateTimer = EXTINGUISH_LANTERN_DURATION;
    } else if (member.state === CrewState.TALKING) {
      // Player-ordered conversation: initiator arrived at target
      const target = member.copulationTarget;
      const partner = target?.type === 'crew' ? crew.find(c => c.id === target.actorId) : undefined;
      member.copulationTarget = null;
      if (partner) {
        partner.copulationTarget = null;
        beginConversation(member, partner, brightness);
      } else {
        member.state = CrewState.IDLE;
        member.idleTimer = 1 + Math.random() * 2;
      }
    } else if (member.state === CrewState.TAKING_ITEM) {
      if (barrelInventory) performTakeItem(member, barrelInventory);
      member.state = CrewState.IDLE;
      member.idleTimer = 1 + Math.random() * 2;
    } else if (member.state === CrewState.PETTING) {
      member.stateTimer = PET_DURATION;
    } else if (member.state === CrewState.CARRYING_CORPSE) {
      member.stateTimer = 2; // pickup duration
    } else if (member.state === CrewState.BURYING_AT_SEA) {
      member.stateTimer = 3; // toss duration
    } else {
      member.idleTimer = 2 + Math.random() * 4;
    }
    return;
  }

  const target = member.path[0];
  const targetX = target.x * TILE_SIZE + TILE_SIZE / 2;
  const targetY = target.y * TILE_SIZE + TILE_SIZE / 2;

  if (target.deck !== member.deck) {
    member.deck = target.deck;
  }

  const dx = targetX - member.pixelX;
  const dy = targetY - member.pixelY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Update facing direction based on dominant axis
  if (dist > 2) {
    if (Math.abs(dx) > Math.abs(dy)) {
      member.facing = dx > 0 ? 'east' : 'west';
    } else {
      member.facing = dy > 0 ? 'south' : 'north';
    }
  }

  if (dist < 2) {
    member.pixelX = targetX;
    member.pixelY = targetY;
    member.path.shift();

    // Wobbly movement: drunk crew may deviate perpendicular
    if (member.path.length > 0) {
      const wobbleChance = member.conditions.has('drunk') ? 0.25 : member.conditions.has('tipsy') ? 0.08 : 0;
      if (wobbleChance > 0 && Math.random() < wobbleChance) {
        const next = member.path[0];
        const ndx = next.x - target.x;
        const ndy = next.y - target.y;
        // Perpendicular offset: swap dx/dy and randomly negate
        const sign = Math.random() < 0.5 ? -1 : 1;
        const wobbleX = target.x + (-ndy * sign || sign);
        const wobbleY = target.y + (ndx * sign || 0);
        // Only wobble if the tile is walkable and on the same deck
        const deck = decks?.[target.deck];
        if (deck && wobbleY >= 0 && wobbleY < deck.height && wobbleX >= 0 && wobbleX < deck.width && WALKABLE.has(deck.tiles[wobbleY][wobbleX])) {
          member.path.unshift({ x: wobbleX, y: wobbleY, deck: target.deck });
        }
      }
    }
  } else {
    const speedMult = member.conditions.has('injured') ? 0.75 : 1.0;
    const move = CREW_SPEED * speedMult * dt;
    member.pixelX += (dx / dist) * Math.min(move, dist);
    member.pixelY += (dy / dist) * Math.min(move, dist);
  }

  // Wandering crew can stop and chat when passing someone
  if (member.state === CrewState.WALKING) {
    tryStartConversationWhileWalking(member, crew, brightness);
  }
}

export function orderCrewTo(member: Actor, target: DeckPoint, decks: Deck[], targetState: CrewState = CrewState.IDLE): boolean {
  const from = currentTile(member);
  const pathFn = member.conditions.has('flyer') ? findPathFlying : findPath;
  const path = pathFn(decks, from, target);
  if (path && path.length > 0) {
    member.path = path;
    member.state = CrewState.WALKING;
    member.targetState = targetState;
    return true;
  }
  return false;
}

export function orderCrewToAdjacentTile(member: Actor, target: DeckPoint, decks: Deck[], targetState: CrewState): boolean {
  // Try direct path first (works for walkable tiles like BED, STOVE, HELM)
  if (orderCrewTo(member, target, decks, targetState)) return true;

  // Try adjacent walkable tiles (for non-walkable targets like CANNON)
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of DIRS) {
    const adj: DeckPoint = { x: target.x + dx, y: target.y + dy, deck: target.deck };
    if (orderCrewTo(member, adj, decks, targetState)) return true;
  }
  return false;
}

/** Walk to a tile beside the target, preferring the side closest to the member's current position. */
export function orderCrewBesideTile(member: Actor, target: DeckPoint, decks: Deck[], targetState: CrewState): boolean {
  const from = currentTile(member);
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const candidates = DIRS.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy, deck: target.deck }));
  candidates.sort((a, b) => {
    const da = Math.abs(a.x - from.x) + Math.abs(a.y - from.y);
    const db = Math.abs(b.x - from.x) + Math.abs(b.y - from.y);
    return da - db;
  });
  for (const adj of candidates) {
    if (orderCrewTo(member, adj, decks, targetState)) return true;
  }
  // Fallback: stand on the same tile if no adjacent tile reachable
  return orderCrewTo(member, target, decks, targetState);
}
