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
