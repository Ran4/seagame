import { Island, WorldMap, SECONDS_PER_DAY } from './types';
import { CONFIG } from './config';
export { SECONDS_PER_DAY };

const ISLANDS: Island[] = [
  { id: 0, name: 'Tortuga', x: 20, y: 30, hasHarbor: true, description: 'A bustling pirate haven with taverns and trade.' },
  { id: 1, name: 'Isla Muerta', x: 75, y: 15, hasHarbor: false, description: 'A cursed island shrouded in fog. No safe harbor.' },
  { id: 2, name: 'Port Royal', x: 35, y: 60, hasHarbor: true, description: 'A fortified colonial port with a busy market.' },
  { id: 3, name: 'Skull Rock', x: 85, y: 55, hasHarbor: false, description: 'A jagged rock formation. Rumored treasure inside.', hidden: true },
  { id: 4, name: 'Palm Cove', x: 10, y: 10, hasHarbor: true, description: 'A peaceful cove with fresh water and coconuts.' },
  { id: 5, name: 'Blackwater Bay', x: 60, y: 45, hasHarbor: true, description: 'Deep natural harbor. Shipwrights available.' },
  { id: 6, name: 'Serpent Isle', x: 45, y: 75, hasHarbor: false, description: 'Dense jungle. Strange sounds at night.', hidden: true },
];

// 1 cell = 1 league
const LEAGUES_PER_DAY = 70;
export const SHIP_SPEED = LEAGUES_PER_DAY / SECONDS_PER_DAY; // ~0.0972 leagues/sec

export const DOCKING_DISTANCE = 3; // leagues
// SHARED SYSTEM C — deep-water / region helper. Combat encounters, sea-monster rolls,
// and (later) swordfish availability gate on "open ocean, no land in view".
export const DEEP_WATER_DISTANCE = 12; // leagues — beyond this from any island = deep water

export function createWorldMap(): WorldMap {
  let shipX = 50;
  let shipY = 40;

  if (CONFIG.startNearIsland) {
    const island = ISLANDS[Math.floor(Math.random() * ISLANDS.length)];
    // Place ship 2 leagues south of the island
    shipX = island.x;
    shipY = island.y + 2;
    console.log(`[config] Starting near ${island.name} (${shipX}, ${shipY})`);
  }

  return {
    shipX,
    shipY,
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

/** Distance (leagues) from the ship to the nearest island. Infinity if no islands. */
export function distanceToNearestIsland(map: WorldMap): number {
  let min = Infinity;
  for (const isl of map.islands) {
    const dx = map.shipX - isl.x;
    const dy = map.shipY - isl.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < min) min = d;
  }
  return min;
}

/** True if the ship is in open ocean (far from any island). */
export function isInDeepWater(map: WorldMap): boolean {
  return distanceToNearestIsland(map) > DEEP_WATER_DISTANCE;
}

/** Returns the nearest harbor island within docking distance, or null. */
export function getNearbyHarborIsland(map: WorldMap): Island | null {
  for (const island of map.islands) {
    if (!island.hasHarbor) continue;
    const dx = island.x - map.shipX;
    const dy = island.y - map.shipY;
    if (Math.sqrt(dx * dx + dy * dy) <= DOCKING_DISTANCE) return island;
  }
  return null;
}

// Overlay layout constants (shared with renderer.drawMapOverlay)
const OVL_X = 40, OVL_Y = 40, OVL_W = 880, OVL_H = 460;

/** Handle a click on the map overlay. Returns: 'click' (play sound), 'close' (close overlay), or null (no action). */
export function handleMapOverlayClick(map: WorldMap, mx: number, my: number, hasExpertNavigator?: boolean): 'click' | 'close' | null {
  // Close button (top-right X)
  const closeX = OVL_X + OVL_W - 28;
  const closeY = OVL_Y + 8;
  const closeSize = 20;
  if (mx >= closeX && mx <= closeX + closeSize && my >= closeY && my <= closeY + closeSize) {
    return 'close';
  }

  if (mx >= OVL_X && mx <= OVL_X + OVL_W && my >= OVL_Y && my <= OVL_Y + OVL_H) {
    // Stop Sailing button (bottom-right of overlay)
    if (map.destinationIsland) {
      const btnW = 100, btnH = 22;
      const btnX = OVL_X + OVL_W - btnW - 10;
      const btnY = OVL_Y + OVL_H - btnH - 8;
      if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
        stopSailing(map);
        return 'click';
      }
    }
    // Check if clicked on an island
    const toScreenX = (wx: number) => OVL_X + (wx / 100) * OVL_W;
    const toScreenY = (wy: number) => OVL_Y + 30 + ((wy / 80) * (OVL_H - 50));
    for (const island of map.islands) {
      if (island.hidden && !hasExpertNavigator) continue;
      const ix = toScreenX(island.x);
      const iy = toScreenY(island.y);
      const dx = mx - ix;
      const dy = my - iy;
      if (dx * dx + dy * dy < 14 * 14) {
        setDestination(map, island);
        return 'click';
      }
    }
    return null; // inside overlay but no hit
  }

  // Clicked outside overlay — close it
  return 'close';
}
