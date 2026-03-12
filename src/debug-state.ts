import { World, SECONDS_PER_DAY, getShipBrightness, TILE_SIZE } from './types';

interface ActorSummary {
  id: number;
  name: string;
  type: string;
  state: string;
  deck: number;
  tile: { x: number; y: number };
  conditions: string[];
}

interface ActorDetail extends ActorSummary {
  sex: string;
  hunger: number;
  energy: number;
  morale: number;
  facing: string;
  relations: { name: string; friendship: number; attraction: number }[];
  inventory: { name: string; quantity: number }[];
  hands: { name: string; quantity: number }[];
  statuses: Record<string, any>;
  commandQueue: { name: string }[];
  speechBubbleText: string | null;
  thoughtBubble: string | null;
}

export interface StateSnapshot {
  log: { text: string; time: number }[];
  actors: ActorSummary[];
  actorDetails: Record<string, ActorDetail>;
  time: { gameTime: number; timeOfDay: number; brightness: number; speed: number };
  barrels: Record<string, { name: string; quantity: number }[]>;
  spottedIslands: number[];
}

export function serializeState(world: World): StateSnapshot {
  const timeOfDay = (world.time + world.dayTimeOffset) % SECONDS_PER_DAY;
  const brightness = getShipBrightness(timeOfDay);

  const actorSummaries: ActorSummary[] = world.actors.map(a => ({
    id: a.id,
    name: a.profile.name,
    type: a.actorType,
    state: a.state,
    deck: a.deck,
    tile: { x: Math.floor(a.pixelX / TILE_SIZE), y: Math.floor(a.pixelY / TILE_SIZE) },
    conditions: Array.from(a.conditions),
  }));

  const actorDetails: Record<string, ActorDetail> = {};
  for (const a of world.actors) {
    const key = a.profile.name.toLowerCase();
    const statuses: Record<string, any> = {};
    for (const [k, v] of a.statuses) {
      statuses[k] = v;
    }
    actorDetails[key] = {
      id: a.id,
      name: a.profile.name,
      type: a.actorType,
      state: a.state,
      deck: a.deck,
      tile: { x: Math.floor(a.pixelX / TILE_SIZE), y: Math.floor(a.pixelY / TILE_SIZE) },
      conditions: Array.from(a.conditions),
      sex: a.profile.sex,
      hunger: a.profile.hunger,
      energy: a.profile.energy,
      morale: a.profile.morale,
      facing: a.facing,
      relations: a.relations.map(r => {
        const other = world.actors.find(o => o.id === r.actorId);
        return {
          name: other ? other.profile.name : `#${r.actorId}`,
          friendship: r.friendship,
          attraction: r.attraction,
        };
      }),
      inventory: a.profile.inventory.map(i => ({ name: i.name, quantity: i.quantity })),
      hands: a.profile.hands.map(i => ({ name: i.name, quantity: i.quantity })),
      statuses,
      commandQueue: a.commandQueue.map(c => ({ name: c.name })),
      speechBubbleText: a.speechBubbleText,
      thoughtBubble: a.thoughtBubble,
    };
  }

  const barrels: Record<string, { name: string; quantity: number }[]> = {};
  for (const [key, items] of world.barrelInventory) {
    if (items.length > 0) {
      barrels[key] = items.map(i => ({ name: i.name, quantity: i.quantity }));
    }
  }

  return {
    log: world.activityLog.slice(-50),
    actors: actorSummaries,
    actorDetails,
    time: {
      gameTime: world.time,
      timeOfDay,
      brightness: Math.round(brightness * 100) / 100,
      speed: world.worldMap.currentSpeed,
    },
    barrels,
    spottedIslands: Array.from(world.spottedIslands),
  };
}
