import { Actor, ActorType, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, Item, ActivityLogEntry, NIGHT_FEAR_MORALE_THRESHOLD, LANTERN_SAFE_RADIUS, WorldMap, World, SKILL_MASTERY } from '../types';
import { findPath, findPathFlying } from '../pathfinding';
import { createSemen } from '../items';
import { tryStartConversation, updateTalking, tickConversationCooldown } from '../conversation';
import { updateWalking, orderCrewBesideTile } from './movement';
import { tryExecuteCommand } from './commands';
import { trySeekLustPartner } from './lust';
import { LUST_ACTOR_TYPES } from './factory';
import { AudioManager } from '../audio';

// Needs decay
const HUNGER_RATE = 0.7;
const ENERGY_RATE = 0.4;

// Morale
const MORALE_RATE = 0.3; // drift toward target per second
const NIGHT_FEAR_RATE = 1.0;
const DOG_MORALE_BONUS = 15; // added to morale target if friendly dog on same deck
const DOGHATER_PROXIMITY = 5; // tiles

// Social
const PET_FRIENDSHIP_GAIN = 2;

// Shanty singing
const SHANTY_MORALE_THRESHOLD = 160;
const SHANTY_MIN_SINGERS = 3;
const SHANTY_MAX_SINGERS = 5;
const SHANTY_CHANCE = 0.004;
const SHANTY_MORALE_GAIN = 10;
const SHANTY_FRIENDSHIP_GAIN = 5;
const SHANTY_COOLDOWN = 120;
const SHANTY_DEFAULT_DURATION = 30;

// Dancing
const DANCE_MORALE_THRESHOLD = 140;
const DANCE_MIN_DANCERS = 2;
const DANCE_CHANCE = 0.003;
const DANCE_DURATION = 15;
const DANCE_MORALE_GAIN = 8;
const DANCE_FRIENDSHIP_GAIN = 4;
const DANCE_COOLDOWN = 150;

function getDogMoraleAdj(member: Actor, crew: Actor[]): number {
  if (member.actorType !== 'human') return 0;
  const hasFriendlyDog = crew.some(c =>
    c.actorType === 'dog' && c.deck === member.deck &&
    (member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128
  );
  const hasNearbyUnfriendlyDog = member.conditions.has('doghater') && crew.some(c => {
    if (c.actorType !== 'dog' || c.deck !== member.deck) return false;
    if ((member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128) return false;
    const dx = (c.pixelX - member.pixelX) / TILE_SIZE;
    const dy = (c.pixelY - member.pixelY) / TILE_SIZE;
    return dx * dx + dy * dy <= DOGHATER_PROXIMITY * DOGHATER_PROXIMITY;
  });
  return (hasFriendlyDog ? DOG_MORALE_BONUS : 0) + (hasNearbyUnfriendlyDog ? -DOG_MORALE_BONUS : 0);
}

// Actor types that can do human work (steer, man cannons, navigate, etc.)
const WORK_ACTOR_TYPES: Set<ActorType> = new Set(['human']);

const ISLAND_SPOT_DISTANCE = 3;    // leagues
const ISLAND_SPOT_RESET = 16;      // leagues — clear spotted set when all islands are this far
const LAND_HO_MORALE_BOOST = 30;
const LAND_HO_SPEECH_DURATION = 6; // seconds

const ENERGY_RESTORE_RATE = 255 / 240; // full restore in ~240s (8 in-game hours)
const DRUNKEDNESS_RATE = 255 / 720;
const LUST_RATE_MALE = 0.15;         // 0→255 in ~1700s (~2.4 days)
const LUST_RATE_FEMALE = 0.05;       // +108 over 3-day growth phase
const LUST_CYCLE_LENGTH = 6 * 720;   // 6 in-game days = 4320s

/**
 * Status/Conditions system.
 *
 * Two layers on each Actor:
 *   statuses  — Map<string, payload | null>.  Raw state, persisted.
 *              Permanent traits: statuses.set('dickless', null)
 *              Tracked values:  statuses.set('drunkedness', { amount: 180 })
 *
 *   conditions — Set<string>.  Rebuilt every tick by this function.
 *              Contains every raw status key PLUS derived conditions:
 *                'drunk'    — drunkedness.amount >= 128
 *                'tipsy'    — drunkedness.amount >= 64 (exclusive with drunk)
 *                'exhausted' — energy < 25 (sleeps even in daytime)
 *                'tired'    — energy < 60 (exclusive with exhausted)
 *                'starving' — hunger < 15
 *                'hungry'   — hunger < 70 (exclusive with starving)
 *
 * Game code should read conditions (not statuses) for behaviour checks.
 * Write to statuses when changing state; conditions update next tick.
 */
export function refreshConditions(member: Actor, crew: Actor[]): void {
  member.conditions.clear();
  // Copy raw status keys
  for (const key of member.statuses.keys()) {
    member.conditions.add(key);
  }
  // Derived: drunkedness levels
  const drunkedness = (member.statuses.get('drunkedness') as { amount: number } | null)?.amount ?? 0;
  if (drunkedness >= 128) {
    member.conditions.add('drunk');
  } else if (drunkedness >= 64) {
    member.conditions.add('tipsy');
  }
  // Derived: lust levels
  const lustAmount = (member.statuses.get('lust') as { amount: number } | null)?.amount ?? 0;
  if (lustAmount > 160) member.conditions.add('lustful');
  // Derived: needs
  if (member.profile.energy < 25) member.conditions.add('exhausted');
  else if (member.profile.energy < 60) member.conditions.add('tired');
  if (member.profile.hunger < 15) member.conditions.add('starving');
  else if (member.profile.hunger < 70) member.conditions.add('hungry');
  // Derived: morale levels
  if (member.profile.morale >= 192) member.conditions.add('happy');
  else if (member.profile.morale >= 128) member.conditions.add('content');
  else if (member.profile.morale < 32) member.conditions.add('mutinous');
  else if (member.profile.morale < 64) member.conditions.add('miserable');
  else if (member.profile.morale < 96) member.conditions.add('grumbling');
  // Derived: dog proximity
  if (member.actorType === 'human') {
    const hasFriendlyDog = crew.some(c =>
      c.actorType === 'dog' && c.deck === member.deck &&
      (member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128
    );
    if (hasFriendlyDog) member.conditions.add('near_friendly_dog');
    const hasNearbyUnfriendlyDog = member.conditions.has('doghater') && crew.some(c => {
      if (c.actorType !== 'dog' || c.deck !== member.deck) return false;
      if ((member.relations.find(r => r.actorId === c.id)?.friendship ?? 0) >= 128) return false;
      const dx = (c.pixelX - member.pixelX) / TILE_SIZE;
      const dy = (c.pixelY - member.pixelY) / TILE_SIZE;
      return dx * dx + dy * dy <= DOGHATER_PROXIMITY * DOGHATER_PROXIMITY;
    });
    if (hasNearbyUnfriendlyDog) member.conditions.add('despises_nearby_dog');
  }
}

function getWalkableTiles(deck: Deck, deckIndex: number): DeckPoint[] {
  const tiles: DeckPoint[] = [];
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      if (WALKABLE.has(deck.tiles[y][x])) {
        tiles.push({ x, y, deck: deckIndex });
      }
    }
  }
  return tiles;
}

function findTilesOfType(decks: Deck[], type: TileType): DeckPoint[] {
  const results: DeckPoint[] = [];
  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === type) {
          results.push({ x, y, deck: d });
        }
      }
    }
  }
  return results;
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function currentTile(member: Actor): DeckPoint {
  return {
    x: Math.floor(member.pixelX / TILE_SIZE),
    y: Math.floor(member.pixelY / TILE_SIZE),
    deck: member.deck,
  };
}

/** Can this actor access the given deck? Crow's nest (deck 0) requires climber status. */
function canAccessDeck(member: Actor, deckIndex: number): boolean {
  if (deckIndex === 0 && !member.statuses.has('climber')) return false;
  return true;
}

export function updateActors(crew: Actor[], decks: Deck[], dt: number, barrelInventory: Map<string, Item[]>, gameTime: number, lanternOil: Map<string, number> = new Map(), brightness: number = 1.0, activityLog: ActivityLogEntry[] = [], worldMap?: WorldMap, spottedIslands?: Set<number>, world?: World, audio?: AudioManager): void {
  // Reset spotted islands when ship moves far from all spotted islands
  if (worldMap && spottedIslands && spottedIslands.size > 0) {
    let allFar = true;
    for (const islandId of spottedIslands) {
      const island = worldMap.islands.find(i => i.id === islandId);
      if (island) {
        const dx = worldMap.shipX - island.x;
        const dy = worldMap.shipY - island.y;
        if (Math.sqrt(dx * dx + dy * dy) < ISLAND_SPOT_RESET) {
          allFar = false;
          break;
        }
      }
    }
    if (allFar) spottedIslands.clear();
  }

  for (const member of crew) {
    member.profile.hunger = Math.max(0, member.profile.hunger - HUNGER_RATE * dt);
    member.profile.energy = Math.max(0, member.profile.energy - ENERGY_RATE * dt);

    // Drunkedness decay via statuses
    const drunkStatus = member.statuses.get('drunkedness') as { amount: number } | undefined;
    if (drunkStatus) {
      drunkStatus.amount = Math.max(0, drunkStatus.amount - DRUNKEDNESS_RATE * dt);
      if (drunkStatus.amount <= 0) member.statuses.delete('drunkedness');
    }

    // Lust tick
    const lustStatus = member.statuses.get('lust') as { amount: number; cycleTimer?: number } | undefined;
    if (lustStatus) {
      if (member.profile.sex === 'M') {
        lustStatus.amount = Math.min(255, lustStatus.amount + LUST_RATE_MALE * dt);
      } else {
        // Women's cycle: 6-day period, first half grows, second half decays
        lustStatus.cycleTimer = ((lustStatus.cycleTimer ?? 0) + dt) % LUST_CYCLE_LENGTH;
        if (lustStatus.cycleTimer < LUST_CYCLE_LENGTH / 2) {
          lustStatus.amount = Math.min(255, lustStatus.amount + LUST_RATE_FEMALE * dt);
        } else {
          lustStatus.amount = Math.max(0, lustStatus.amount - LUST_RATE_FEMALE * dt);
        }
      }
    }

    // Tick lust seek cooldown
    if (member.lustSeekCooldown > 0) {
      member.lustSeekCooldown = Math.max(0, member.lustSeekCooldown - dt);
    }

    // Morale tick — drift toward target derived from needs/relations
    // TODO: combat victory bonus
    // TODO: harbor visit recency bonus
    // TODO: storm survival / loot share / idle boredom
    {
      const hungerContrib = member.profile.hunger;
      const energyContrib = member.profile.energy;
      let avgFriendship = 128;
      if (member.relations.length > 0) {
        let sum = 0;
        for (const r of member.relations) sum += r.friendship;
        avgFriendship = sum / member.relations.length;
      }
      const dogMoraleAdj = getDogMoraleAdj(member, crew);
      const target = Math.min(255, (hungerContrib + energyContrib + avgFriendship) / 3 + dogMoraleAdj);
      const diff = target - member.profile.morale;
      const step = MORALE_RATE * dt;
      if (Math.abs(diff) < step) {
        member.profile.morale = target;
      } else {
        member.profile.morale += Math.sign(diff) * step;
      }

      // Night fear: crew lose extra morale in the dark when not near a lit lantern
      if (brightness < 0.5 && member.profile.morale < NIGHT_FEAR_MORALE_THRESHOLD) {
        const mx = Math.floor(member.pixelX / TILE_SIZE);
        const my = Math.floor(member.pixelY / TILE_SIZE);
        let nearLitLantern = false;
        for (const [key, oil] of lanternOil) {
          if (oil <= 0) continue;
          const prefix = `${member.deck}-`;
          if (!key.startsWith(prefix)) continue;
          const parts = key.slice(prefix.length).split('-');
          const lx = parseInt(parts[0]);
          const ly = parseInt(parts[1]);
          if (Math.abs(mx - lx) + Math.abs(my - ly) <= LANTERN_SAFE_RADIUS) {
            nearLitLantern = true;
            break;
          }
        }
        if (!nearLitLantern) {
          member.profile.morale = Math.max(0, member.profile.morale - NIGHT_FEAR_RATE * dt);
        }
      }
    }

    refreshConditions(member, crew);

    tickConversationCooldown(member, dt);

    // Tick down thought bubble
    if (member.thoughtBubble) {
      member.thoughtBubbleTimer -= dt;
      if (member.thoughtBubbleTimer <= 0) {
        member.thoughtBubble = null;
        member.thoughtBubbleTimer = 0;
      }
    }

    switch (member.state) {
      case CrewState.IDLE:
        updateIdle(member, decks, dt, crew, lanternOil, brightness, activityLog, gameTime, world, audio);
        break;
      case CrewState.WALKING:
        updateWalking(member, dt, crew, brightness, barrelInventory, decks);
        break;
      case CrewState.EATING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          if (member.actorType === 'human') member.skills.cooking = Math.min(255, (member.skills.cooking ?? 0) + 4);
          const hungerRestore = (member.actorType === 'human' && (member.skills.cooking ?? 0) >= SKILL_MASTERY) ? 270 : 180;
          member.profile.hunger = Math.min(255, member.profile.hunger + hungerRestore);
          activityLog.push({ text: `${member.profile.name} finished eating`, time: gameTime });
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.SLEEPING:
        member.profile.energy = Math.min(255, member.profile.energy + ENERGY_RESTORE_RATE * dt);
        if (member.profile.energy >= 255) {
          activityLog.push({ text: `${member.profile.name} woke up`, time: gameTime });
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.STEERING:
        if (member.actorType === 'human') member.skills.sailing = Math.min(255, (member.skills.sailing ?? 0) + 0.05 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.MANNING_CANNON:
        if (member.actorType === 'human') member.skills.gunnery = Math.min(255, (member.skills.gunnery ?? 0) + 0.2 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.NAVIGATING:
        if (member.actorType === 'human') member.skills.navigation = Math.min(255, (member.skills.navigation ?? 0) + 0.05 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.LOOKOUT:
        member.stateTimer -= dt;
        // Tick speech bubble (updateTalking only runs for TALKING state)
        if (member.speechBubbleTimer > 0) {
          member.speechBubbleTimer -= dt;
          if (member.speechBubbleTimer <= 0) {
            member.speechBubbleText = null;
            member.speechBubbleTimer = 0;
          }
        }
        if (worldMap && spottedIslands) {
          checkForIslandSpotting(member, crew, worldMap, spottedIslands, activityLog, gameTime);
        }
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.LIGHTING_LANTERN:
      case CrewState.EXTINGUISHING_LANTERN:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          // Find the lantern tile adjacent to this crew member
          const ct = currentTile(member);
          const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]];
          for (const [dx, dy] of DIRS) {
            const lx = ct.x + dx;
            const ly = ct.y + dy;
            if (ly >= 0 && ly < decks[ct.deck].height && lx >= 0 && lx < decks[ct.deck].width) {
              if (decks[ct.deck].tiles[ly][lx] === TileType.LANTERN) {
                const key = `${ct.deck}-${lx}-${ly}`;
                lanternOil.set(key, member.state === CrewState.LIGHTING_LANTERN ? 100 : 0);
                break;
              }
            }
          }
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.KISSING:
        member.stateTimer -= dt;
        // Pull in crew partner on first frame
        if (member.copulationTarget?.type === 'crew') {
          const target = member.copulationTarget;
          const partner = crew.find(c => c.id === target.actorId);
          if (partner && partner.state !== CrewState.KISSING) {
            partner.state = CrewState.KISSING;
            partner.stateTimer = member.stateTimer;
            partner.copulationTarget = { type: 'crew', actorId: member.id };
            partner.path = [];
          }
          // Slow lean-in: both drift toward each other until ~6px apart
          if (partner && partner.state === CrewState.KISSING) {
            const kdx = partner.pixelX - member.pixelX;
            const kdy = partner.pixelY - member.pixelY;
            const kdist = Math.sqrt(kdx * kdx + kdy * kdy);
            if (kdist > 8) {
              const lean = Math.min(20 * dt, (kdist - 8) / 2);
              member.pixelX += (kdx / kdist) * lean;
              member.pixelY += (kdy / kdist) * lean;
              partner.pixelX -= (kdx / kdist) * lean;
              partner.pixelY -= (kdy / kdist) * lean;
            }
          }
        }
        if (member.stateTimer <= 0) {
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const partner = crew.find(c => c.id === target.actorId);
            if (partner) {
              const myRelation = member.relations.find(r => r.actorId === partner.id);
              const theirRelation = partner.relations.find(r => r.actorId === member.id);
              if (myRelation && theirRelation) {
                if ((myRelation.attraction >= 64) && (theirRelation.attraction >= 64)) {
                  // Both attracted — positive kiss
                  myRelation.attraction = Math.min(255, myRelation.attraction + 32);
                  theirRelation.attraction = Math.min(255, theirRelation.attraction + 32);
                  member.thoughtBubble = 'heart';
                  member.thoughtBubbleTimer = 3;
                  activityLog.push({ text: `${member.profile.name} kissed ${partner.profile.name}`, time: gameTime });
                } else {
                  // Unwelcome kiss — negative outcome
                  myRelation.attraction = Math.max(0, myRelation.attraction - 32);
                  myRelation.friendship = Math.max(0, myRelation.friendship - 32);
                  theirRelation.attraction = Math.max(0, theirRelation.attraction - 32);
                  theirRelation.friendship = Math.max(0, theirRelation.friendship - 32);
                  member.thoughtBubble = 'broken_heart';
                  member.thoughtBubbleTimer = 3;
                  activityLog.push({ text: `${member.profile.name} kissed ${partner.profile.name} (unwelcome)`, time: gameTime });
                }
                // Kiss boosts lust for both
                const myLust = member.statuses.get('lust') as { amount: number } | undefined;
                if (myLust) myLust.amount = Math.min(255, myLust.amount + 20);
                const partnerLust = partner.statuses.get('lust') as { amount: number } | undefined;
                if (partnerLust) partnerLust.amount = Math.min(255, partnerLust.amount + 20);
              }
              if (partner.state === CrewState.KISSING) {
                partner.state = CrewState.IDLE;
                partner.idleTimer = 1 + Math.random() * 2;
                partner.copulationTarget = null;
              }
            }
          }
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
      case CrewState.COPULATING:
        member.profile.energy = Math.max(0, member.profile.energy - 4.0 * dt);
        member.stateTimer -= dt;
        // Pull in crew partner on first frame
        if (member.copulationTarget?.type === 'crew') {
          const target = member.copulationTarget;
          const partner = crew.find(c => c.id === target.actorId);
          if (partner && partner.state !== CrewState.COPULATING) {
            partner.state = CrewState.COPULATING;
            partner.stateTimer = member.stateTimer;
            partner.copulationTarget = { type: 'crew', actorId: member.id };
            partner.path = [];
          }
        }
        if (member.stateTimer <= 0) {
          // Male + barrel → produce semen
          if (member.profile.sex === 'M' && member.copulationTarget?.type === 'barrel') {
            const t = member.copulationTarget;
            const key = `${t.deck}-${t.x}-${t.y}`;
            const items = barrelInventory.get(key) || [];
            const existing = items.find(i => i.name === 'Semen' && i.stackable);
            if (existing) {
              existing.quantity += 1;
              existing.weight += 5;
            } else {
              items.push(createSemen(gameTime));
            }
            barrelInventory.set(key, items);
          }
          // Reduce lust after copulation
          const copLust = member.statuses.get('lust') as { amount: number } | undefined;
          if (copLust) copLust.amount = Math.max(0, copLust.amount - 128);
          // End partner's copulation
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const partner = crew.find(c => c.id === target.actorId);
            if (partner && partner.state === CrewState.COPULATING) {
              const partnerCopLust = partner.statuses.get('lust') as { amount: number } | undefined;
              if (partnerCopLust) partnerCopLust.amount = Math.max(0, partnerCopLust.amount - 128);
              partner.state = CrewState.IDLE;
              partner.idleTimer = 1 + Math.random() * 2;
              partner.copulationTarget = null;
            }
            activityLog.push({ text: `${member.profile.name} copulated with ${partner?.profile.name ?? 'someone'}`, time: gameTime });
          } else if (member.copulationTarget?.type === 'barrel') {
            activityLog.push({ text: `${member.profile.name} copulated with a barrel`, time: gameTime });
          }
          member.thoughtBubble = 'heart';
          member.thoughtBubbleTimer = 3;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
      case CrewState.DRINKING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          if (member.consumingItem) {
            activityLog.push({ text: `${member.profile.name} drank ${member.consumingItem.name.toLowerCase()}`, time: gameTime });
            if (member.consumingItem.name === 'Grog ration') {
              const cur = (member.statuses.get('drunkedness') as { amount: number } | undefined)?.amount ?? 0;
              member.statuses.set('drunkedness', { amount: Math.min(255, cur + 140) });
              member.profile.morale = Math.min(255, member.profile.morale + 20);
            }
            if (member.consumingItem.hungerRestore > 0) {
              member.profile.hunger = Math.min(255, member.profile.hunger + member.consumingItem.hungerRestore);
            }
            member.consumingItem = null;
          }
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.TALKING:
        updateTalking(member, crew, dt, brightness);
        break;
      case CrewState.PETTING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          // Apply friendship gains to both petter and pet
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const pet = crew.find(c => c.id === target.actorId);
            if (pet) {
              const myRel = member.relations.find(r => r.actorId === pet.id);
              const theirRel = pet.relations.find(r => r.actorId === member.id);
              if (myRel) myRel.friendship = Math.min(255, myRel.friendship + PET_FRIENDSHIP_GAIN);
              if (theirRel) theirRel.friendship = Math.min(255, theirRel.friendship + PET_FRIENDSHIP_GAIN);
              pet.thoughtBubble = 'heart';
              pet.thoughtBubbleTimer = 3;
              pet.copulationTarget = null;
              pet.idleTimer = 1 + Math.random() * 2;
              activityLog.push({ text: `${member.profile.name} petted ${pet.profile.name}`, time: gameTime });
            }
          }
          member.thoughtBubble = 'heart';
          member.thoughtBubbleTimer = 3;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
      case CrewState.DANCING: {
        if (member.actorType === 'human') member.skills.dancing = Math.min(255, (member.skills.dancing ?? 0) + 0.3 * dt);
        member.profile.energy = Math.max(0, member.profile.energy - 3.0 * dt);
        member.stateTimer -= dt;
        // Dance animation: distinct moves cycling every ~2.5s
        // Each move: stepping, spinning (pause-spin-pause), or moonwalking
        const danceT = DANCE_DURATION - member.stateTimer;
        const dancePhase = member.id * 1.7;
        const danceW = 5;
        const danceFacings: Array<Actor['facing']> = ['south', 'east', 'north', 'west'];
        const moveCycle = 2.5;
        const moveIdx = Math.floor((danceT + dancePhase) / moveCycle) % 3;
        const moveT = ((danceT + dancePhase) % moveCycle); // time within current move
        if (moveIdx === 0) {
          // Spinning: pause 0.5s → spin 1.5s → pause 0.5s
          if (moveT < 0.5 || moveT > 2.0) {
            member.facing = 'south'; // stand still facing south
          } else {
            const spinDir = Math.sin(dancePhase) > 0 ? 1 : -1;
            member.facing = danceFacings[((Math.floor((moveT - 0.5) * 8) * spinDir) % 4 + 4) % 4];
          }
        } else if (moveIdx === 1) {
          // Moonwalk — move one way, face the other
          member.pixelX += 5 * danceW * Math.cos(danceW * danceT + dancePhase) * dt;
          const vx = Math.cos(danceW * danceT + dancePhase);
          member.facing = vx > 0 ? 'west' : 'east';
        } else {
          // Stepping — move back and forth, face movement direction
          member.pixelX += 5 * danceW * Math.cos(danceW * danceT + dancePhase) * dt;
          member.pixelY += 3 * danceW * Math.cos(0.7 * danceW * danceT + dancePhase + 2) * dt;
          const vx = Math.cos(danceW * danceT + dancePhase);
          member.facing = vx > 0.3 ? 'east' : vx < -0.3 ? 'west' : 'south';
        }
        if (member.stateTimer <= 0) {
          member.profile.morale = Math.min(255, member.profile.morale + DANCE_MORALE_GAIN);
          if (member.shantyInitiatorId !== null) {
            for (const other of crew) {
              if (other.id === member.id || other.shantyInitiatorId !== member.shantyInitiatorId) continue;
              const rel = member.relations.find(r => r.actorId === other.id);
              if (rel) rel.friendship = Math.min(255, rel.friendship + DANCE_FRIENDSHIP_GAIN);
            }
            if (member.id === member.shantyInitiatorId) {
              activityLog.push({ text: `${member.profile.name} led a merry dance`, time: gameTime });
              if (world) world.danceCooldown = DANCE_COOLDOWN;
            }
          }
          member.shantyInitiatorId = null;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.conversationCooldown = 30;
        }
        break;
      }
      case CrewState.SINGING:
        if (member.actorType === 'human') member.skills.singing = Math.min(255, (member.skills.singing ?? 0) + 0.3 * dt);
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.profile.morale = Math.min(255, member.profile.morale + SHANTY_MORALE_GAIN);
          // Friendship gain with all other singers (same shantyInitiatorId)
          if (member.shantyInitiatorId !== null) {
            for (const other of crew) {
              if (other.id === member.id || other.shantyInitiatorId !== member.shantyInitiatorId) continue;
              const rel = member.relations.find(r => r.actorId === other.id);
              if (rel) rel.friendship = Math.min(255, rel.friendship + SHANTY_FRIENDSHIP_GAIN);
            }
            // Initiator logs
            if (member.id === member.shantyInitiatorId) {
              activityLog.push({ text: `${member.profile.name} led the crew in a sea shanty`, time: gameTime });
              if (world) world.shantyCooldown = SHANTY_COOLDOWN;
              if (audio) audio.stopShanty();
            }
          }
          member.shantyInitiatorId = null;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.conversationCooldown = 30;
        }
        break;
    }
  }

  // Mutiny detection (after per-actor loop)
  if (world) {
    const humans = crew.filter(c => c.actorType === 'human');
    const mutinousCount = humans.filter(c => c.conditions.has('mutinous')).length;
    const threshold = Math.ceil(humans.length * 0.6);

    if (world.mutinyState === 'none') {
      if (mutinousCount >= threshold && humans.length > 0) {
        world.mutinyState = 'ultimatum';
        world.mutinyTimer = 720; // 720 seconds = 1 in-game day
        activityLog.push({ text: 'The crew issues an ultimatum!', time: gameTime });
      }
    } else if (world.mutinyState === 'ultimatum') {
      world.mutinyTimer -= dt;
      if (mutinousCount < threshold) {
        world.mutinyState = 'none';
        world.mutinyTimer = 0;
        activityLog.push({ text: 'The crew calms down — mutiny averted.', time: gameTime });
      } else if (world.mutinyTimer <= 0) {
        world.mutinyState = 'game_over';
        activityLog.push({ text: 'MUTINY! The crew has seized the ship.', time: gameTime });
      }
    }
  }
}

function checkForIslandSpotting(lookout: Actor, crew: Actor[], worldMap: WorldMap, spottedIslands: Set<number>, activityLog: ActivityLogEntry[], gameTime: number): void {
  const spotDistance = lookout.conditions.has('eagle_eye') ? 5 : ISLAND_SPOT_DISTANCE;
  for (const island of worldMap.islands) {
    if (spottedIslands.has(island.id)) continue;
    const dx = worldMap.shipX - island.x;
    const dy = worldMap.shipY - island.y;
    if (Math.sqrt(dx * dx + dy * dy) <= spotDistance) {
      spottedIslands.add(island.id);
      lookout.speechBubbleText = 'Land ho!';
      lookout.speechBubbleTimer = LAND_HO_SPEECH_DURATION;
      for (const member of crew) {
        member.profile.morale = Math.min(255, member.profile.morale + LAND_HO_MORALE_BOOST);
      }
      activityLog.push({ text: `${lookout.profile.name} spotted ${island.name}: "Land ho!" - the crew's spirits soar!`, time: gameTime });
      return; // one island per tick
    }
  }
}

function updateIdle(member: Actor, decks: Deck[], dt: number, crew: Actor[], lanternOil: Map<string, number>, brightness: number, activityLog: ActivityLogEntry[] = [], gameTime: number = 0, world?: World, audio?: AudioManager): void {
  // Waiting for copulation partner — don't wander
  if (member.copulationTarget) return;

  member.idleTimer -= dt;
  if (member.idleTimer > 0) return;

  // Process command queue first
  if (tryExecuteCommand(member, decks, crew, activityLog, gameTime, world, audio)) return;

  if (member.actorType === 'human') {
    updateIdleHuman(member, decks, dt, crew, lanternOil, brightness, world, audio);
  } else {
    updateIdleAnimal(member, decks, dt, crew, brightness);
  }
}

function updateIdleHuman(member: Actor, decks: Deck[], dt: number, crew: Actor[], lanternOil: Map<string, number>, brightness: number, world?: World, audio?: AudioManager): void {
  const from = currentTile(member);

  // Hungry? Go eat
  if (member.conditions.has('hungry') || member.conditions.has('starving')) {
    const stoves = findTilesOfType(decks, TileType.STOVE);
    const target = pickRandom(stoves);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.EATING;
        return;
      }
    }
  }

  // Lustful? Seek a partner
  if (member.conditions.has('lustful') && member.lustSeekCooldown <= 0) {
    if (trySeekLustPartner(member, crew, decks)) return;
  }

  // Tired? Go sleep (daytime restriction: only if dark or exhausted)
  if ((member.conditions.has('tired') || member.conditions.has('exhausted')) && (brightness < 0.7 || member.conditions.has('exhausted'))) {
    const beds = findTilesOfType(decks, TileType.BED);
    const target = pickRandom(beds);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.SLEEPING;
        return;
      }
    }
  }

  // Light unlit lanterns when dark
  if (brightness < 0.7) {
    const lanterns = findTilesOfType(decks, TileType.LANTERN);
    const unlit = lanterns.filter(l => {
      const key = `${l.deck}-${l.x}-${l.y}`;
      const oil = lanternOil.get(key) ?? 0;
      if (oil > 0) return false;
      return !crew.some(c => c.id !== member.id && c.targetState === CrewState.LIGHTING_LANTERN && c.state === CrewState.WALKING && c.path.length > 0 && c.path[c.path.length - 1].x === l.x && c.path[c.path.length - 1].y === l.y && c.path[c.path.length - 1].deck === l.deck);
    });
    const target = pickRandom(unlit);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.LIGHTING_LANTERN;
        return;
      }
    }
  }

  // Extinguish lit lanterns when bright
  if (brightness > 0.9) {
    const lanterns = findTilesOfType(decks, TileType.LANTERN);
    const lit = lanterns.filter(l => {
      const key = `${l.deck}-${l.x}-${l.y}`;
      const oil = lanternOil.get(key) ?? 0;
      if (oil <= 0) return false;
      return !crew.some(c => c.id !== member.id && c.targetState === CrewState.EXTINGUISHING_LANTERN && c.state === CrewState.WALKING && c.path.length > 0 && c.path[c.path.length - 1].x === l.x && c.path[c.path.length - 1].y === l.y && c.path[c.path.length - 1].deck === l.deck);
    });
    const target = pickRandom(lit);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.EXTINGUISHING_LANTERN;
        return;
      }
    }
  }

  // Try to start a conversation with nearby idle crew
  if (tryStartConversation(member, crew, brightness)) return;

  // Shanty singing: nighttime, high average morale, 3+ idle humans on same deck
  if (world && brightness < 0.5 && world.shantyCooldown <= 0 && member.conversationCooldown <= 0 && Math.random() < SHANTY_CHANCE) {
    const humans = crew.filter(c => c.actorType === 'human');
    const avgMorale = humans.reduce((sum, c) => sum + c.profile.morale, 0) / humans.length;
    if (avgMorale >= SHANTY_MORALE_THRESHOLD) {
      const candidates = humans.filter(c =>
        c.deck === member.deck && c.id !== member.id &&
        (c.state === CrewState.IDLE || (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE)) &&
        c.conversationCooldown <= 0
      );
      if (candidates.length >= SHANTY_MIN_SINGERS - 1) {
        const singers = [member, ...candidates.slice(0, SHANTY_MAX_SINGERS - 1)];
        const duration = audio?.shantyDuration || SHANTY_DEFAULT_DURATION;
        const maleCount = singers.filter(s => s.profile.sex === 'M').length;
        const femaleCount = singers.filter(s => s.profile.sex === 'F').length;

        for (const singer of singers) {
          singer.state = CrewState.SINGING;
          singer.stateTimer = duration;
          singer.shantyInitiatorId = member.id;
          singer.thoughtBubble = 'music_note';
          singer.thoughtBubbleTimer = duration;
          singer.conversationCooldown = 30;
          singer.path = [];
        }

        if (audio) audio.playShanty({ male: maleCount, female: femaleCount }, member.deck);
        return;
      }
    }
  }

  // Dancing: daytime, high average morale, 2+ idle humans on same deck
  if (world && brightness > 0.7 && world.danceCooldown <= 0 && member.conversationCooldown <= 0 && Math.random() < DANCE_CHANCE) {
    const humansForDance = crew.filter(c => c.actorType === 'human');
    const avgMoraleDance = humansForDance.reduce((sum, c) => sum + c.profile.morale, 0) / humansForDance.length;
    if (avgMoraleDance >= DANCE_MORALE_THRESHOLD) {
      const danceCandidates = humansForDance.filter(c =>
        c.deck === member.deck && c.id !== member.id &&
        (c.state === CrewState.IDLE || (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE)) &&
        c.conversationCooldown <= 0
      );
      if (danceCandidates.length >= DANCE_MIN_DANCERS - 1) {
        const dancers = [member, ...danceCandidates.slice(0, 4)];
        for (const dancer of dancers) {
          dancer.state = CrewState.DANCING;
          dancer.stateTimer = DANCE_DURATION;
          dancer.shantyInitiatorId = member.id;
          dancer.thoughtBubble = 'music_note';
          dancer.thoughtBubbleTimer = DANCE_DURATION;
          dancer.conversationCooldown = 30;
          dancer.path = [];
        }
        return;
      }
    }
  }

  // Otherwise wander
  wanderRandomly(member, decks);
}

function updateIdleAnimal(member: Actor, decks: Deck[], dt: number, allActors: Actor[], brightness: number): void {
  const from = currentTile(member);

  // Hungry? Go eat at stove
  if (member.conditions.has('hungry') || member.conditions.has('starving')) {
    const stoves = findTilesOfType(decks, TileType.STOVE);
    const target = pickRandom(stoves);
    if (target) {
      const path = findPath(decks, from, target);
      if (path) {
        member.path = path;
        member.state = CrewState.WALKING;
        member.targetState = CrewState.EATING;
        return;
      }
    }
  }

  // Lustful? Seek same-species partner (dogs and monkeys only)
  if (LUST_ACTOR_TYPES.has(member.actorType) && member.conditions.has('lustful') && member.lustSeekCooldown <= 0) {
    if (trySeekLustPartner(member, allActors, decks)) return;
  }

  // Tired? Find a place to sleep
  if ((member.conditions.has('tired') || member.conditions.has('exhausted')) && (brightness < 0.7 || member.conditions.has('exhausted'))) {
    if (member.actorType === 'parrot') {
      // Parrots sleep in nests, never beds
      const nests = findTilesOfType(decks, TileType.NEST);
      let foundNest = false;
      if (nests.length > 0) {
        const target = pickRandom(nests);
        if (target) {
          const pathFn = findPathFlying;
          const path = pathFn(decks, from, target);
          if (path) {
            member.path = path;
            member.state = CrewState.WALKING;
            member.targetState = CrewState.SLEEPING;
            foundNest = true;
          }
        }
      }
      if (!foundNest) {
        // No nest reachable — find a random floor tile to sleep on
        const floors = findTilesOfType(decks, TileType.FLOOR).filter(f => f.deck === member.deck);
        const target = pickRandom(floors);
        if (target) {
          const path = findPathFlying(decks, from, target);
          if (path && path.length <= 8) {
            member.path = path;
            member.state = CrewState.WALKING;
            member.targetState = CrewState.SLEEPING;
            return;
          }
        }
        // Fallback: sleep in place
        member.state = CrewState.SLEEPING;
      }
      return;
    }

    // Non-parrot animals: try nearby bed, otherwise sleep in place
    const beds = findTilesOfType(decks, TileType.BED);
    const sameDeckBeds = beds.filter(b => b.deck === member.deck);
    let foundBed = false;
    if (sameDeckBeds.length > 0) {
      const target = pickRandom(sameDeckBeds);
      if (target) {
        const path = findPath(decks, from, target);
        if (path && path.length <= 8) {
          member.path = path;
          member.state = CrewState.WALKING;
          member.targetState = CrewState.SLEEPING;
          foundBed = true;
        }
      }
    }
    if (!foundBed) {
      member.state = CrewState.SLEEPING;
      return;
    }
    return;
  }

  // Dog: follow liked entity
  if (member.actorType === 'dog') {
    if (tryFollowLikedEntity(member, allActors, decks)) return;
  }

  // Rare conversations (1/20th of human chance)
  if (Math.random() < 0.05) { // 5% chance to even attempt (vs always for humans)
    if (tryStartConversation(member, allActors, brightness)) return;
  }

  // Otherwise wander
  wanderRandomly(member, decks);
}

/** Dog behavior: follow the entity it likes most, across decks if needed. */
function tryFollowLikedEntity(member: Actor, allActors: Actor[], decks: Deck[]): boolean {
  let bestFriend: Actor | null = null;
  let bestFriendship = 0;
  for (const rel of member.relations) {
    if (rel.friendship > bestFriendship) {
      const other = allActors.find(a => a.id === rel.actorId);
      if (other && other.state !== CrewState.SLEEPING && canAccessDeck(member, other.deck)) {
        bestFriendship = rel.friendship;
        bestFriend = other;
      }
    }
  }
  if (!bestFriend || bestFriendship < 100) return false;

  // On same deck: only follow if far enough away
  if (bestFriend.deck === member.deck) {
    const dx = bestFriend.pixelX - member.pixelX;
    const dy = bestFriend.pixelY - member.pixelY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < TILE_SIZE * 2.5) return false;
  }

  const friendTile = { x: Math.floor(bestFriend.pixelX / TILE_SIZE), y: Math.floor(bestFriend.pixelY / TILE_SIZE), deck: bestFriend.deck };
  return orderCrewBesideTile(member, friendTile, decks, CrewState.IDLE);
}

function wanderRandomly(member: Actor, decks: Deck[]): void {
  const from = currentTile(member);
  const allWalkable: DeckPoint[] = [];
  for (let d = 0; d < decks.length; d++) {
    if (!canAccessDeck(member, d)) continue;
    allWalkable.push(...getWalkableTiles(decks[d], d));
  }
  const target = pickRandom(allWalkable);
  if (target) {
    const pathFn = member.conditions.has('flyer') ? findPathFlying : findPath;
    const path = pathFn(decks, from, target);
    if (path && path.length > 0) {
      member.path = path;
      member.state = CrewState.WALKING;
      member.targetState = CrewState.IDLE;
    } else {
      member.idleTimer = 1 + Math.random() * 2;
    }
  }
}
