// FEATURE 7 — Harbor contracts (delivery & hunt missions).
//
// A harbour NPC offers 1-3 contracts per dock. Accepting records the contract on
// world.contracts. Completion is detected elsewhere:
//   - 'deliver' completes when the ship later docks at the target island
//     (checkDeliverContracts, called from completeDocking).
//   - 'hunt' completes when a named enemy ship is defeated
//     (checkHuntContract, called from the combat boarding/defeat path).
// Keep v1 simple but functional end-to-end: accept → condition met → reward.

import { World, Contract, Island } from './types';

// Enemy-ship names the world can generate (kept in sync with ENEMY_NAMES in game.ts).
// Hunt contracts target one of these so a future encounter can actually match.
const HUNTABLE_SHIP_NAMES = [
  'Black Gull', 'Sea Wraith', 'Crimson Maw', 'Salt Reaver',
  'Gallows Wind', 'Drowned Lady', 'Iron Barracuda', 'Storm Vulture',
];

/** Allocate the next contract id and bump the counter. */
function nextId(world: World): number {
  const id = world.nextContractId;
  world.nextContractId = id + 1;
  return id;
}

/** Other dockable harbour islands (excluding the one currently docked). */
function otherHarborIslands(world: World): Island[] {
  const hereId = world.docking.island?.id;
  return world.worldMap.islands.filter(i => i.hasHarbor && i.id !== hereId);
}

/** Generate 1-3 fresh contract offers for the currently docked harbour. */
export function generateContractOffers(world: World): void {
  const offers: Contract[] = [];
  const count = 1 + Math.floor(Math.random() * 3); // 1..3

  const harbors = otherHarborIslands(world);
  // Names already targeted by an active hunt so we don't double up.
  const activeHuntNames = new Set(world.contracts.filter(c => c.kind === 'hunt' && c.status === 'active').map(c => c.targetShipName));

  for (let n = 0; n < count; n++) {
    const wantHunt = Math.random() < 0.45 || harbors.length === 0;
    if (wantHunt) {
      const candidates = HUNTABLE_SHIP_NAMES.filter(name => !activeHuntNames.has(name) && !offers.some(o => o.targetShipName === name));
      if (candidates.length === 0) continue;
      const shipName = candidates[Math.floor(Math.random() * candidates.length)];
      const reward = 120 + Math.floor(Math.random() * 18) * 10; // 120..290
      offers.push({
        id: nextId(world),
        kind: 'hunt',
        description: `Hunt the pirate ship ${shipName}`,
        targetShipName: shipName,
        reward,
        status: 'active',
      });
    } else {
      // Avoid duplicate delivery targets within this batch.
      const candidates = harbors.filter(h => !offers.some(o => o.targetIslandId === h.id));
      if (candidates.length === 0) continue;
      const dest = candidates[Math.floor(Math.random() * candidates.length)];
      const reward = 60 + Math.floor(Math.random() * 15) * 10; // 60..200
      offers.push({
        id: nextId(world),
        kind: 'deliver',
        description: `Deliver cargo to ${dest.name}`,
        targetIslandId: dest.id,
        reward,
        status: 'active',
      });
    }
  }
  world.contractOffers = offers;
}

/** Accept a contract offer by id: move it from offers → active contracts. */
export function acceptContract(world: World, offerId: number): Contract | null {
  const idx = world.contractOffers.findIndex(o => o.id === offerId);
  if (idx === -1) return null;
  const contract = world.contractOffers.splice(idx, 1)[0];
  contract.status = 'active';
  world.contracts.push(contract);
  world.activityLog.push({ text: `Contract accepted: ${contract.description} (reward ${contract.reward} gold).`, time: world.time });
  return contract;
}

/** Pay out a completed contract: add gold, mark completed, log. */
function completeContract(world: World, contract: Contract): void {
  contract.status = 'completed';
  world.gold += contract.reward;
  world.activityLog.push({ text: `Contract complete: ${contract.description}! Earned ${contract.reward} gold (${world.gold} total).`, time: world.time });
}

/** Called from completeDocking: complete any 'deliver' contracts for the island just reached. */
export function checkDeliverContracts(world: World, islandId: number): { completed: Contract[] } {
  const completed: Contract[] = [];
  for (const c of world.contracts) {
    if (c.status === 'active' && c.kind === 'deliver' && c.targetIslandId === islandId) {
      completeContract(world, c);
      completed.push(c);
    }
  }
  // Drop completed deliveries from the active list to keep it tidy.
  if (completed.length > 0) {
    world.contracts = world.contracts.filter(c => !completed.includes(c));
  }
  return { completed };
}

/** Called when an enemy ship is defeated: complete any matching 'hunt' contract(s). */
export function checkHuntContract(world: World, shipName: string): void {
  const matched: Contract[] = [];
  for (const c of world.contracts) {
    if (c.status === 'active' && c.kind === 'hunt' && c.targetShipName === shipName) {
      completeContract(world, c);
      matched.push(c);
    }
  }
  if (matched.length > 0) {
    world.contracts = world.contracts.filter(c => !matched.includes(c));
  }
}

/** Active contracts (for HUD / notice-board listing). */
export function activeContracts(world: World): Contract[] {
  return world.contracts.filter(c => c.status === 'active');
}
