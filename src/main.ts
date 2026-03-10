import { createWorld, update } from './game';
import { Renderer } from './renderer';
import { createInputHandler } from './input';
import { AudioManager } from './audio';
import { loadSprites } from './sprites';

const canvas = document.getElementById('game') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

const world = createWorld();
const renderer = new Renderer(canvas);
const input = createInputHandler(canvas);
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
