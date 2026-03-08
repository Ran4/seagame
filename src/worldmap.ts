import { Island, WorldMap } from './types';

const ISLANDS: Island[] = [
  { id: 0, name: 'Tortuga', x: 20, y: 30, hasHarbor: true, description: 'A bustling pirate haven with taverns and trade.' },
  { id: 1, name: 'Isla Muerta', x: 75, y: 15, hasHarbor: false, description: 'A cursed island shrouded in fog. No safe harbor.' },
  { id: 2, name: 'Port Royal', x: 35, y: 60, hasHarbor: true, description: 'A fortified colonial port with a busy market.' },
  { id: 3, name: 'Skull Rock', x: 85, y: 55, hasHarbor: false, description: 'A jagged rock formation. Rumored treasure inside.' },
  { id: 4, name: 'Palm Cove', x: 10, y: 10, hasHarbor: true, description: 'A peaceful cove with fresh water and coconuts.' },
  { id: 5, name: 'Blackwater Bay', x: 60, y: 45, hasHarbor: true, description: 'Deep natural harbor. Shipwrights available.' },
  { id: 6, name: 'Serpent Isle', x: 45, y: 75, hasHarbor: false, description: 'Dense jungle. Strange sounds at night.' },
];

// 1 cell = 1 league, 1 in-game day = 12 min IRL (720 sec)
export const SECONDS_PER_DAY = 720;
const LEAGUES_PER_DAY = 70;
export const SHIP_SPEED = LEAGUES_PER_DAY / SECONDS_PER_DAY; // ~0.0972 leagues/sec

export function createWorldMap(): WorldMap {
  return {
    shipX: 50,
    shipY: 40,
    currentHeading: 0,
    currentSpeed: 0,
    targetHeading: null,
    targetSpeed: 'stop',
    destinationIsland: null,
    islands: ISLANDS,
  };
}

/** Navigator recalculates target heading toward destination island. */
export function updateNavigator(map: WorldMap): void {
  if (!map.destinationIsland) return;

  const dx = map.destinationIsland.x - map.shipX;
  const dy = map.destinationIsland.y - map.shipY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.5) {
    // Arrived
    map.destinationIsland = null;
    map.targetSpeed = 'stop';
    map.targetHeading = null;
    return;
  }

  map.targetHeading = Math.atan2(dy, dx);
  map.targetSpeed = 'full';
}

/** Helmsman executes navigator's orders — instantly sets heading/speed. */
export function updateHelmsman(map: WorldMap): void {
  if (map.targetHeading !== null) {
    map.currentHeading = map.targetHeading;
  }
  map.currentSpeed = map.targetSpeed === 'full' ? SHIP_SPEED : 0;
}

/** Move ship along current heading at current speed. Always runs (coasting). */
export function updateSailing(map: WorldMap, dt: number): void {
  if (map.currentSpeed === 0) return;

  map.shipX += Math.cos(map.currentHeading) * map.currentSpeed * dt;
  map.shipY += Math.sin(map.currentHeading) * map.currentSpeed * dt;

  // Clamp to world bounds
  map.shipX = Math.max(0, Math.min(100, map.shipX));
  map.shipY = Math.max(0, Math.min(80, map.shipY));
}

export function stopSailing(map: WorldMap): void {
  map.destinationIsland = null;
  map.targetSpeed = 'stop';
  map.targetHeading = null;
}

export function setDestination(map: WorldMap, island: Island): void {
  map.destinationIsland = island;
}
