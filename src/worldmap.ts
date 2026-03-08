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

const SHIP_SPEED = 0.8; // cells per second

export function createWorldMap(): WorldMap {
  return {
    shipX: 50,
    shipY: 40,
    destX: null,
    destY: null,
    destinationIsland: null,
    islands: ISLANDS,
  };
}

export function updateSailing(map: WorldMap, dt: number): void {
  if (map.destX === null || map.destY === null) return;

  const dx = map.destX - map.shipX;
  const dy = map.destY - map.shipY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.5) {
    map.shipX = map.destX;
    map.shipY = map.destY;
    map.destX = null;
    map.destY = null;
    map.destinationIsland = null;
    return;
  }

  const move = SHIP_SPEED * dt;
  map.shipX += (dx / dist) * Math.min(move, dist);
  map.shipY += (dy / dist) * Math.min(move, dist);
}

export function setDestination(map: WorldMap, island: Island): void {
  map.destX = island.x;
  map.destY = island.y;
  map.destinationIsland = island;
}
