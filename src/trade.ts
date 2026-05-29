// FEATURE 7 — Harbor trading (SHARED SYSTEM B: gold currency).
//
// Real buying & selling at a harbour merchant, driven by the docked island's
// personality (Island.economy). A flat base-price table for goods + sellable loot
// is scaled by the island's priceBuyMult / priceSellMult. Buying deducts world.gold
// and drops the item into a ship barrel (or the buyer's inventory as a fallback);
// selling removes the item from crew/barrels and adds gold.
//
// Pure helpers operating on the World struct, mirroring combat.ts / harbor.ts style.

import { World, Item, IslandEconomy } from './types';
import {
  createGrogRation, createWood, createCannonball, createMedicine, createFish,
  createTreasureMap,
} from './items';
import { findFirstBarrelKey } from './combat';
import { pickTreasureIsland } from './treasure';

/** A purchasable good offered by the merchant. */
export interface GoodDef {
  name: string;            // display name (matches Item.name when bought)
  basePrice: number;       // gold per unit at a neutral (mult=1) island
  make: (gameTime: number) => Item;  // factory for the purchased item
  blackMarketOnly?: boolean;  // sold only at black-market islands
  honestOnly?: boolean;       // NOT sold at black-market islands (they deal stolen goods)
}

/** Base goods a merchant can stock. Prices are pre-multiplier (neutral island). */
export const GOODS: GoodDef[] = [
  { name: 'Grog ration', basePrice: 12, make: createGrogRation },
  { name: 'Fish',        basePrice: 8,  make: (t) => createFish('common', t), honestOnly: true },
  { name: 'Wood',        basePrice: 20, make: createWood },
  { name: 'Cannonball',  basePrice: 15, make: createCannonball },
  { name: 'Medicine',    basePrice: 35, make: createMedicine },
  // FEATURE 8 — a treasure map for sale. The target island is chosen at purchase time
  // (see buyGood's special case). Genuine maps are pricey; this is a gamble worth taking.
  { name: 'Treasure map', basePrice: 80, make: (t) => createTreasureMap({ islandId: 0 }, t) },
];

/** Base sell value (pre-multiplier) for loot/goods the crew can offload at a merchant.
 * Keyed by Item.name. Items absent from this table cannot be sold. */
export const SELL_PRICES: Record<string, number> = {
  // Food / fish
  'Fish': 5,
  'Tropical fish': 18,
  'Swordfish': 30,
  'Pufferfish': 12,
  'Tentacle meat': 22,
  // Supplies (can be re-sold at a loss)
  'Grog ration': 6,
  'Wood': 10,
  'Cannonball': 8,
  'Medicine': 18,
  // Kraken loot
  'Kraken ink': 90,
  'Kraken tooth': 140,
  // Treasure loot (gems / artifacts / treasure goods)
  'Gem': 120,
  'Artifact': 200,
  'Treasure map': 25,
  'Treasure goods': 60,
};

// Loot the black market pays a premium for (stolen goods / plunder).
const BLACK_MARKET_LOOT = new Set(['Kraken ink', 'Kraken tooth', 'Gem', 'Artifact', 'Treasure map', 'Treasure goods']);

const NEUTRAL_ECONOMY: IslandEconomy = { flavor: 'A quiet, ordinary port.', priceBuyMult: 1, priceSellMult: 1 };

/** The economy of the currently docked island (neutral defaults if none/undefined). */
export function dockedEconomy(world: World): IslandEconomy {
  return world.docking.island?.economy ?? NEUTRAL_ECONOMY;
}

/** Goods the docked merchant currently stocks (filtered by black-market/honest flags). */
export function availableGoods(world: World): GoodDef[] {
  const econ = dockedEconomy(world);
  return GOODS.filter(g => {
    if (g.blackMarketOnly && !econ.blackMarket) return false;
    if (g.honestOnly && econ.blackMarket) return false;
    return true;
  });
}

/** Buy price (gold) for a good at the docked island, rounded. */
export function buyPrice(world: World, good: GoodDef): number {
  return Math.max(1, Math.round(good.basePrice * dockedEconomy(world).priceBuyMult));
}

/** Sell price (gold) for an item name at the docked island, or 0 if not sellable. */
export function sellPrice(world: World, itemName: string): number {
  const base = SELL_PRICES[itemName];
  if (base === undefined) return 0;
  const econ = dockedEconomy(world);
  let mult = econ.priceSellMult;
  // Black markets pay a premium for plunder.
  if (econ.blackMarket && BLACK_MARKET_LOOT.has(itemName)) mult *= 1.5;
  return Math.max(1, Math.round(base * mult));
}

/** Attempt to buy one unit of a good. Returns true on success (gold deducted, item delivered). */
export function buyGood(world: World, good: GoodDef): boolean {
  const price = buyPrice(world, good);
  if (world.gold < price) {
    world.activityLog.push({ text: `Not enough gold for ${good.name} (need ${price}, have ${world.gold}).`, time: world.time });
    return false;
  }
  world.gold -= price;
  let item = good.make(world.time);
  // FEATURE 8 — a purchased treasure map points to a randomly chosen island; market maps
  // are mostly genuine (20% fake — buyer beware).
  if (good.name === 'Treasure map') {
    item = createTreasureMap({ islandId: pickTreasureIsland(world), fake: Math.random() < 0.2 }, world.time);
  }
  // Prefer dropping into a ship barrel; fall back to the buyer's inventory.
  const barrelKey = findFirstBarrelKey(world);
  if (barrelKey) {
    const items = world.barrelInventory.get(barrelKey) ?? [];
    if (item.stackable) {
      const existing = items.find(i => i.name === item.name && i.stackable);
      if (existing) { existing.quantity += 1; existing.weight += item.weight; }
      else items.push(item);
    } else {
      items.push(item);
    }
    world.barrelInventory.set(barrelKey, items);
  } else {
    const member = world.selectedActorId !== null ? world.actors.find(a => a.id === world.selectedActorId) : null;
    if (member) member.profile.inventory.push(item);
  }
  world.activityLog.push({ text: `Bought ${good.name} for ${price} gold (${world.gold} left).`, time: world.time });
  return true;
}

/** A sellable holding aggregated across crew inventories + ship barrels. */
export interface SellableEntry {
  name: string;
  quantity: number;
  unitPrice: number;
}

/** Aggregate every sellable item the crew/barrels currently hold, with the docked sell price. */
export function sellableInventory(world: World): SellableEntry[] {
  const counts = new Map<string, number>();
  const add = (item: Item) => {
    if (SELL_PRICES[item.name] === undefined) return;
    if (item.cursed) return; // FEATURE 8 — cursed loot can't be sold
    counts.set(item.name, (counts.get(item.name) ?? 0) + (item.stackable ? item.quantity : 1));
  };
  for (const items of world.barrelInventory.values()) for (const it of items) add(it);
  for (const a of world.actors) {
    if (a.statuses.has('npc')) continue;
    for (const it of a.profile.inventory) add(it);
  }
  const out: SellableEntry[] = [];
  for (const [name, quantity] of counts) {
    out.push({ name, quantity, unitPrice: sellPrice(world, name) });
  }
  out.sort((a, b) => b.unitPrice - a.unitPrice);
  return out;
}

/** Remove one unit of `itemName` from barrels or crew inventory. Returns true if removed. */
function removeOneItem(world: World, itemName: string): boolean {
  // Barrels first.
  for (const [key, items] of world.barrelInventory) {
    const idx = items.findIndex(i => i.name === itemName && !i.cursed);
    if (idx === -1) continue;
    const it = items[idx];
    if (it.stackable && it.quantity > 1) {
      const per = Math.round(it.weight / it.quantity);
      it.quantity -= 1; it.weight -= per;
    } else {
      items.splice(idx, 1);
    }
    if (items.length === 0) world.barrelInventory.delete(key);
    return true;
  }
  // Then crew inventories.
  for (const a of world.actors) {
    if (a.statuses.has('npc')) continue;
    const inv = a.profile.inventory;
    const idx = inv.findIndex(i => i.name === itemName && !i.cursed);
    if (idx === -1) continue;
    const it = inv[idx];
    if (it.stackable && it.quantity > 1) {
      const per = Math.round(it.weight / it.quantity);
      it.quantity -= 1; it.weight -= per;
    } else {
      inv.splice(idx, 1);
    }
    return true;
  }
  return false;
}

/** Sell one unit of `itemName`. Returns true on success (item removed, gold added). */
export function sellItem(world: World, itemName: string): boolean {
  const price = sellPrice(world, itemName);
  if (price <= 0) return false;
  if (!removeOneItem(world, itemName)) {
    world.activityLog.push({ text: `No ${itemName} left to sell.`, time: world.time });
    return false;
  }
  world.gold += price;
  world.activityLog.push({ text: `Sold ${itemName} for ${price} gold (${world.gold} total).`, time: world.time });
  return true;
}
