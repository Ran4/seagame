import { Item, Actor, ActivityLogEntry } from './types';

export function createCutlass(gameTime: number = 0): Item {
  return {
    name: 'Cutlass', createdAt: gameTime, weight: 900,
    description: 'A short, broad sabre favoured by pirates.',
    stackable: false, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

export function createGrogRation(gameTime: number = 0): Item {
  return {
    name: 'Grog ration', createdAt: gameTime, weight: 285,
    description: 'A generous measure of watered-down rum.',
    stackable: false, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

export type FishKind = 'common' | 'tropical' | 'swordfish' | 'pufferfish';

/** Fish caught while fishing. Spoil fast (~600s = ~10 in-game hours). */
export function createFish(kind: FishKind, gameTime: number = 0): Item {
  switch (kind) {
    case 'tropical':
      return {
        name: 'Tropical fish', createdAt: gameTime, weight: 350,
        description: 'A brightly coloured reef fish. Fetches a good price at harbour.',
        stackable: false, quantity: 1, spoilAfter: 600, hungerRestore: 30,
      };
    case 'swordfish':
      return {
        name: 'Swordfish', createdAt: gameTime, weight: 1400,
        description: 'A huge deep-water fighter with a bladed snout. A hearty meal.',
        stackable: false, quantity: 1, spoilAfter: 600, hungerRestore: 50,
      };
    case 'pufferfish':
      return {
        name: 'Pufferfish', createdAt: gameTime, weight: 300,
        description: 'A spiny puffer. Filling, but its flesh is poisonous if not prepared right.',
        stackable: false, quantity: 1, spoilAfter: 600, hungerRestore: 50,
      };
    case 'common':
    default:
      return {
        name: 'Fish', createdAt: gameTime, weight: 400,
        description: 'A plain fish, fresh off the line.',
        stackable: false, quantity: 1, spoilAfter: 600, hungerRestore: 20,
      };
  }
}

/** Timber for patching hull breaches / repairing damaged objects. Stackable, never spoils. */
export function createWood(gameTime: number = 0): Item {
  return {
    name: 'Wood', createdAt: gameTime, weight: 2000,
    description: 'Spare planking and timber for patching the hull and repairing the ship.',
    stackable: true, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

/** Cannon ammunition. Stackable, never spoils. Consumed when a cannon fires (if present). */
export function createCannonball(gameTime: number = 0): Item {
  return {
    name: 'Cannonball', createdAt: gameTime, weight: 5000,
    description: 'A heavy iron ball. Loaded into the cannons to fire on enemy ships.',
    stackable: true, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

/** Medicine — consumed (via Drink path) to clear/reduce the 'injured' status. */
export function createMedicine(gameTime: number = 0): Item {
  return {
    name: 'Medicine', createdAt: gameTime, weight: 200,
    description: 'A pouch of salves and bandages. Patches up an injured crew member.',
    stackable: true, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

// --- FEATURE 6: Sea Monster / Kraken loot ---

/** Kraken ink — a prized trade good (sells high at harbour). Stackable, never spoils. */
export function createKrakenInk(gameTime: number = 0): Item {
  return {
    name: 'Kraken ink', createdAt: gameTime, weight: 600,
    description: 'A jar of inky black fluid wrung from a slain kraken. Worth a fortune to scribes and dyers.',
    stackable: true, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

/** Kraken tooth — a legendary weapon trophy. Non-stackable, never spoils. */
export function createKrakenTooth(gameTime: number = 0): Item {
  return {
    name: 'Kraken tooth', createdAt: gameTime, weight: 1100,
    description: 'A curved, serrated tooth as long as a forearm. Lashed to a haft it makes a fearsome blade.',
    stackable: false, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

/** Tentacle meat — a hearty (if rubbery) meal. Spoils fast like fish. */
export function createTentacleMeat(gameTime: number = 0): Item {
  return {
    name: 'Tentacle meat', createdAt: gameTime, weight: 1800,
    description: 'A thick slab of kraken tentacle. Chewy, briny, and astonishingly filling.',
    stackable: false, quantity: 1, spoilAfter: 600, hungerRestore: 60,
  };
}

// --- FEATURE 8: Treasure Maps & Exploration ---

/** A treasure map pointing to a specific island. `fake` maps lead nowhere (trap/empty).
 * The target island + fake flag live in `mapData`. Non-stackable, never spoils. */
export function createTreasureMap(opts: { islandId: number; fake?: boolean }, gameTime: number = 0): Item {
  return {
    name: 'Treasure map', createdAt: gameTime, weight: 30,
    description: 'A weathered map marked with an X. Read it at the map table to chart a course.',
    stackable: false, quantity: 1, spoilAfter: null, hungerRestore: 0,
    mapData: { islandId: opts.islandId, fake: opts.fake ?? false },
  };
}

/** A cut gem — pure trade value, sells very high at harbour. Stackable, never spoils. */
export function createGem(gameTime: number = 0): Item {
  return {
    name: 'Gem', createdAt: gameTime, weight: 60,
    description: 'A glittering cut gemstone. Worth a small fortune to the right buyer.',
    stackable: true, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

/** An ancient artifact — lore curio, fetches a princely sum. Non-stackable, never spoils. */
export function createArtifact(gameTime: number = 0): Item {
  const LORE = [
    'A tarnished idol of a forgotten sea-god, eyes set with black pearls.',
    'A captain\'s astrolabe etched with stars no chart records.',
    'A jade serpent coiled about a drowned man\'s ring.',
    'A conquistador\'s breastplate, dented and salt-crusted.',
    'A music box that plays a tune sailors swear lures sirens.',
  ];
  return {
    name: 'Artifact', createdAt: gameTime, weight: 1200,
    description: LORE[Math.floor(Math.random() * LORE.length)],
    stackable: false, quantity: 1, spoilAfter: null, hungerRestore: 0,
  };
}

/** A cursed relic — drags down morale and cannot be dropped or sold (see 'cursed' status). */
export function createCursedItem(gameTime: number = 0): Item {
  const NAMES = [
    'Cursed doubloon', 'Bleeding skull', 'Weeping idol', 'Black opal of Cortez',
  ];
  return {
    name: NAMES[Math.floor(Math.random() * NAMES.length)], createdAt: gameTime, weight: 200,
    description: 'A cold, malevolent relic. The crew dare not part with it — nor do they want to.',
    stackable: false, quantity: 1, spoilAfter: null, hungerRestore: 0,
    cursed: true,
  };
}

export function createSemen(gameTime: number): Item {
  return {
    name: 'Semen', createdAt: gameTime, weight: 5,
    description: 'A viscous fluid.',
    stackable: true, quantity: 1, spoilAfter: 3600, hungerRestore: 5,
  };
}

export function updateSpoilage(barrelInventory: Map<string, Item[]>, actors: Actor[], gameTime: number, activityLog: ActivityLogEntry[]): void {
  for (const [key, items] of barrelInventory) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.spoilAfter !== null && gameTime - item.createdAt >= item.spoilAfter) {
        activityLog.push({ text: `${item.name} in barrel spoiled`, time: gameTime });
        items.splice(i, 1);
      }
    }
    if (items.length === 0) barrelInventory.delete(key);
  }
  for (const actor of actors) {
    for (let i = actor.profile.inventory.length - 1; i >= 0; i--) {
      const item = actor.profile.inventory[i];
      if (item.spoilAfter !== null && gameTime - item.createdAt >= item.spoilAfter) {
        activityLog.push({ text: `${actor.profile.name}'s ${item.name} spoiled`, time: gameTime });
        actor.profile.inventory.splice(i, 1);
      }
    }
  }
}
