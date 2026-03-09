import { CrewMember, CrewRelation, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, CREW_SPEED, Sex, Item, LIGHT_LANTERN_DURATION } from './types';
import { findPath } from './pathfinding';
import { createCutlass, createSemen } from './items';
import { tryStartConversation, tryStartConversationWhileWalking, updateTalking, tickConversationCooldown, beginConversation } from './conversation';

const HUNGER_RATE = 0.7;
const ENERGY_RATE = 0.4;
const HUNGER_THRESHOLD = 80;
const ENERGY_THRESHOLD = 60;
const EAT_DURATION = 8;
const ENERGY_RESTORE_RATE = 255 / 240; // full restore in ~240s (8 in-game hours)
const STEER_DURATION = 999999;
const CANNON_DURATION = 15;
const LOOKOUT_DURATION = 30;
const NAVIGATE_DURATION = 999999;
const COPULATE_DURATION = 15;
const KISS_DURATION = 3;

const PIRATE_NAMES = [
  'Anne', 'Jack', 'Mary', 'Flint',
  'Morgan', 'Pete', 'Jane', 'Bones',
];

const CREW_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

const PIRATE_SEXES: Record<string, Sex> = {
  'Anne': 'F', 'Jack': 'M', 'Mary': 'F', 'Flint': 'M',
  'Morgan': 'M', 'Pete': 'M', 'Jane': 'F', 'Bones': 'M',
};

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

function currentTile(member: CrewMember): DeckPoint {
  return {
    x: Math.floor(member.pixelX / TILE_SIZE),
    y: Math.floor(member.pixelY / TILE_SIZE),
    deck: member.deck,
  };
}

export function createCrew(count: number, decks: Deck[]): CrewMember[] {
  const crew: CrewMember[] = [];
  for (let i = 0; i < count; i++) {
    const spawnDeck = 1 + Math.floor(Math.random() * Math.min(2, decks.length - 1));
    const walkable = getWalkableTiles(decks[spawnDeck], spawnDeck);
    const spawn = walkable[Math.floor(Math.random() * walkable.length)];
    // Weighted random for numberOfHands: 99.5% → 2, 0.4% → 1, 0.1% → 0
    const handRoll = Math.random();
    const numberOfHands = handRoll < 0.001 ? 0 : handRoll < 0.005 ? 1 : 2;

    crew.push({
      id: i,
      profile: {
        name: PIRATE_NAMES[i % PIRATE_NAMES.length],
        sex: PIRATE_SEXES[PIRATE_NAMES[i % PIRATE_NAMES.length]] ?? (Math.random() < 0.5 ? 'M' : 'F'),
        color: CREW_COLORS[i % CREW_COLORS.length],
        spriteIndex: i,
        numberOfHands,
        hunger: 200 + Math.random() * 55,
        energy: 200 + Math.random() * 55,
        inventory: [],
        hands: [],
      },
      pixelX: spawn.x * TILE_SIZE + TILE_SIZE / 2,
      pixelY: spawn.y * TILE_SIZE + TILE_SIZE / 2,
      deck: spawnDeck,
      state: CrewState.IDLE,
      targetState: CrewState.IDLE,
      path: [],
      stateTimer: 0,
      idleTimer: Math.random() * 3,
      copulationTarget: null,
      relations: [],
      thoughtBubble: null,
      thoughtBubbleTimer: 0,
      conversationPartnerId: null,
      conversationExchangesLeft: 0,
      conversationPositive: true,
      conversationCooldown: 0,
      conversationMyTurn: false,
      speechBubbleText: null,
      speechBubbleTimer: 0,
    });
  }

  // Initialize relations between all crew members
  for (const member of crew) {
    for (const other of crew) {
      if (other.id === member.id) continue;
      member.relations.push({
        crewId: other.id,
        friendship: 64 + Math.floor(Math.random() * 129), // 64-192
        attraction: Math.floor(Math.random() * 161),       // 0-160
      });
    }
  }

  const jack = crew.find(c => c.profile.name === 'Jack');
  if (jack) {
    jack.profile.hands.push(createCutlass());
  }

  return crew;
}

export function updateCrew(crew: CrewMember[], decks: Deck[], dt: number, barrelInventory: Map<string, Item[]>, gameTime: number, lanternOil: Map<string, number> = new Map(), brightness: number = 1.0): void {
  for (const member of crew) {
    member.profile.hunger = Math.max(0, member.profile.hunger - HUNGER_RATE * dt);
    member.profile.energy = Math.max(0, member.profile.energy - ENERGY_RATE * dt);

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
        updateIdle(member, decks, dt, crew, lanternOil, brightness);
        break;
      case CrewState.WALKING:
        updateWalking(member, dt, crew);
        break;
      case CrewState.EATING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.profile.hunger = Math.min(255, member.profile.hunger + 180);
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.SLEEPING:
        member.profile.energy = Math.min(255, member.profile.energy + ENERGY_RESTORE_RATE * dt);
        if (member.profile.energy >= 255) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.STEERING:
      case CrewState.MANNING_CANNON:
      case CrewState.NAVIGATING:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.LOOKOUT:
        member.stateTimer -= dt;
        if (member.stateTimer <= 0) {
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
        }
        break;
      case CrewState.LIGHTING_LANTERN:
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
                const oil = lanternOil.get(key) ?? 0;
                lanternOil.set(key, oil <= 0 ? 100 : 0);
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
          const partner = crew.find(c => c.id === target.crewId);
          if (partner && partner.state !== CrewState.KISSING) {
            partner.state = CrewState.KISSING;
            partner.stateTimer = member.stateTimer;
            partner.copulationTarget = { type: 'crew', crewId: member.id };
            partner.path = [];
          }
        }
        if (member.stateTimer <= 0) {
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const partner = crew.find(c => c.id === target.crewId);
            if (partner) {
              const myRelation = member.relations.find(r => r.crewId === partner.id);
              const theirRelation = partner.relations.find(r => r.crewId === member.id);
              if (myRelation && theirRelation) {
                if ((myRelation.attraction >= 64) && (theirRelation.attraction >= 64)) {
                  // Both attracted — positive kiss
                  myRelation.attraction = Math.min(255, myRelation.attraction + 32);
                  theirRelation.attraction = Math.min(255, theirRelation.attraction + 32);
                  member.thoughtBubble = 'heart';
                  member.thoughtBubbleTimer = 3;
                } else {
                  // Unwelcome kiss — negative outcome
                  myRelation.attraction = Math.max(0, myRelation.attraction - 32);
                  myRelation.friendship = Math.max(0, myRelation.friendship - 32);
                  theirRelation.attraction = Math.max(0, theirRelation.attraction - 32);
                  theirRelation.friendship = Math.max(0, theirRelation.friendship - 32);
                  member.thoughtBubble = 'broken_heart';
                  member.thoughtBubbleTimer = 3;
                }
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
          const partner = crew.find(c => c.id === target.crewId);
          if (partner && partner.state !== CrewState.COPULATING) {
            partner.state = CrewState.COPULATING;
            partner.stateTimer = member.stateTimer;
            partner.copulationTarget = { type: 'crew', crewId: member.id };
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
          // End partner's copulation
          if (member.copulationTarget?.type === 'crew') {
            const target = member.copulationTarget;
            const partner = crew.find(c => c.id === target.crewId);
            if (partner && partner.state === CrewState.COPULATING) {
              partner.state = CrewState.IDLE;
              partner.idleTimer = 1 + Math.random() * 2;
              partner.copulationTarget = null;
            }
          }
          member.thoughtBubble = 'heart';
          member.thoughtBubbleTimer = 3;
          member.state = CrewState.IDLE;
          member.idleTimer = 1 + Math.random() * 2;
          member.copulationTarget = null;
        }
        break;
      case CrewState.TALKING:
        updateTalking(member, crew, dt, brightness);
        break;
    }
  }
}

function updateIdle(member: CrewMember, decks: Deck[], dt: number, crew: CrewMember[], lanternOil: Map<string, number>, brightness: number): void {
  // Waiting for copulation partner — don't wander
  if (member.copulationTarget) return;

  member.idleTimer -= dt;
  if (member.idleTimer > 0) return;

  const from = currentTile(member);

  // Hungry? Go eat
  if (member.profile.hunger < HUNGER_THRESHOLD) {
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

  // Tired? Go sleep (daytime restriction: only if brightness < 0.7 or energy < 30)
  if (member.profile.energy < ENERGY_THRESHOLD && (brightness < 0.7 || member.profile.energy < 30)) {
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
      // Deconflict: skip if another crew is already heading there
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
      return !crew.some(c => c.id !== member.id && c.targetState === CrewState.LIGHTING_LANTERN && c.state === CrewState.WALKING && c.path.length > 0 && c.path[c.path.length - 1].x === l.x && c.path[c.path.length - 1].y === l.y && c.path[c.path.length - 1].deck === l.deck);
    });
    const target = pickRandom(lit);
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

  // Try to start a conversation with nearby idle crew
  if (tryStartConversation(member, crew, brightness)) return;

  // Otherwise wander
  const allWalkable: DeckPoint[] = [];
  for (let d = 0; d < decks.length; d++) {
    allWalkable.push(...getWalkableTiles(decks[d], d));
  }
  const target = pickRandom(allWalkable);
  if (target) {
    const path = findPath(decks, from, target);
    if (path && path.length > 0) {
      member.path = path;
      member.state = CrewState.WALKING;
      member.targetState = CrewState.IDLE;
    } else {
      member.idleTimer = 1 + Math.random() * 2;
    }
  }
}

function updateWalking(member: CrewMember, dt: number, crew: CrewMember[]): void {
  if (member.path.length === 0) {
    member.state = member.targetState;
    if (member.state === CrewState.EATING) {
      member.stateTimer = EAT_DURATION;
    } else if (member.state === CrewState.SLEEPING) {
      // No timer — sleeps until energy is full (rate-based)
    } else if (member.state === CrewState.STEERING) {
      member.stateTimer = STEER_DURATION;
    } else if (member.state === CrewState.MANNING_CANNON) {
      member.stateTimer = CANNON_DURATION;
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
    } else if (member.state === CrewState.TALKING) {
      // Player-ordered conversation: initiator arrived at target
      const target = member.copulationTarget;
      const partner = target?.type === 'crew' ? crew.find(c => c.id === target.crewId) : undefined;
      member.copulationTarget = null;
      if (partner) {
        partner.copulationTarget = null;
        beginConversation(member, partner);
      } else {
        member.state = CrewState.IDLE;
        member.idleTimer = 1 + Math.random() * 2;
      }
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

  if (dist < 2) {
    member.pixelX = targetX;
    member.pixelY = targetY;
    member.path.shift();
  } else {
    const move = CREW_SPEED * dt;
    member.pixelX += (dx / dist) * Math.min(move, dist);
    member.pixelY += (dy / dist) * Math.min(move, dist);
  }

  // Wandering crew can stop and chat when passing someone
  if (member.state === CrewState.WALKING) {
    tryStartConversationWhileWalking(member, crew);
  }
}

export function orderCrewTo(member: CrewMember, target: DeckPoint, decks: Deck[], targetState: CrewState = CrewState.IDLE): boolean {
  const from = currentTile(member);
  const path = findPath(decks, from, target);
  if (path && path.length > 0) {
    member.path = path;
    member.state = CrewState.WALKING;
    member.targetState = targetState;
    return true;
  }
  return false;
}

export function orderCrewToAdjacentTile(member: CrewMember, target: DeckPoint, decks: Deck[], targetState: CrewState): boolean {
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
