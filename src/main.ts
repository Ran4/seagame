import { createWorld, update } from './game';
import { Renderer3D } from './renderer3d';
import { createInputHandler } from './input';
import { AudioManager } from './audio';
import { loadSprites } from './sprites';
import { serializeState } from './debug-state';
import { loadConfig, CONFIG } from './config';
import { getNearbyHarborIsland } from './worldmap';
import { createDockingState, completeDocking } from './harbor';

const container = document.getElementById('game-container') as HTMLDivElement;
if (!container) throw new Error('Game container not found');

await loadConfig();
const world = createWorld();

if (CONFIG.instantlyDockToNearestHarbor) {
  const island = getNearbyHarborIsland(world.worldMap)
    ?? world.worldMap.islands.find(i => i.hasHarbor) ?? null;
  if (island) {
    // Teleport to the island if not already near
    world.worldMap.shipX = island.x;
    world.worldMap.shipY = island.y;
    // Create docking state and complete instantly
    world.docking = createDockingState(island);
    world.docking.harborAnimOffset = 0;
    completeDocking(world);
    console.log(`[config] Docked instantly at ${island.name}`);
  }
}

// Expose for browser console / chrome extension debugging
(window as any).__world = world;

// POST state snapshot to server every second for /api/state endpoint
setInterval(() => {
  try {
    const snapshot = serializeState(world);
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    }).catch(() => {}); // silent on failure
  } catch {}
}, 1000);

const renderer = new Renderer3D(container);
// Expose renderer for 3D raycasting from game.ts
(window as any).__renderer3d = renderer;

// Input handler binds to the 3D canvas
const input = createInputHandler(renderer.canvasElement);
const audio = new AudioManager();

loadSprites().then(sprites => {
  renderer.setSprites(sprites);
  console.log('Sprites loaded');
}).catch(() => {
  console.log('Sprites not found, using fallback rendering');
});

let lastTime = performance.now();
function loop(timestamp: number): void {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  world.time += dt;

  update(world, input, audio, renderer.getHoveredItem(), dt);
  renderer.render(world, input.mousePos, audio.muted, audio.sfxMuted);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
