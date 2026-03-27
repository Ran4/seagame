import * as THREE from 'three';
import { TILE_SIZE, NIGHT_BRIGHTNESS } from '../types';
import { DECK_HEIGHT, GRID_OFFSET_X, GRID_OFFSET_Z } from './ship-builder';
import { MAT } from './materials';
import type { SceneContext } from './scene-setup';

export interface LightingSystem {
  lanternLights: THREE.PointLight[];
  update(brightness: number, lanternOil: Map<string, number>, time: number): void;
}

const LANTERN_POOL_SIZE = 24;
const LANTERN_COLOR = 0xffc850;
const LANTERN_DISTANCE = 4.0;
const LANTERN_INTENSITY_SCALE = 1.5;

// Sky colors for time of day
const DAY_SKY = new THREE.Color(0x7ec8e3);
const NIGHT_SKY = new THREE.Color(0x0a1628);
const DAWN_SKY = new THREE.Color(0xd4886b);

export function createLightingSystem(ctx: SceneContext): LightingSystem {
  // Pre-allocate lantern point lights
  const lanternLights: THREE.PointLight[] = [];
  for (let i = 0; i < LANTERN_POOL_SIZE; i++) {
    const light = new THREE.PointLight(LANTERN_COLOR, 0, LANTERN_DISTANCE);
    light.visible = false;
    // No shadows on point lights (too expensive)
    ctx.scene.add(light);
    lanternLights.push(light);
  }

  const tmpColor = new THREE.Color();

  function update(brightness: number, lanternOil: Map<string, number>, time: number): void {
    // Update sun intensity and color based on brightness (0.3 = night, 1.0 = day)
    const dayFactor = (brightness - NIGHT_BRIGHTNESS) / (1.0 - NIGHT_BRIGHTNESS);
    const clampedDay = Math.max(0, Math.min(1, dayFactor));

    // Sun
    ctx.sun.intensity = 0.1 + clampedDay * 1.2;
    tmpColor.lerpColors(new THREE.Color(0x2244aa), new THREE.Color(0xfff5e0), clampedDay);
    ctx.sun.color.copy(tmpColor);
    // Sun position: higher at day, lower at dusk/dawn
    const sunAngle = clampedDay * Math.PI * 0.4 + Math.PI * 0.1;
    ctx.sun.position.set(
      Math.cos(sunAngle) * 20,
      Math.sin(sunAngle) * 20 + 2,
      -8,
    );

    // Ambient
    ctx.ambient.intensity = 0.08 + clampedDay * 0.35;

    // Hemisphere
    ctx.hemisphere.intensity = 0.15 + clampedDay * 0.45;

    // Sky/fog color
    if (clampedDay > 0.5) {
      tmpColor.lerpColors(DAWN_SKY, DAY_SKY, (clampedDay - 0.5) * 2);
    } else {
      tmpColor.lerpColors(NIGHT_SKY, DAWN_SKY, clampedDay * 2);
    }
    ctx.scene.background = tmpColor.clone();
    if (ctx.scene.fog instanceof THREE.FogExp2) {
      ctx.scene.fog.color.copy(tmpColor);
    }

    // Update lantern point lights
    let lightIdx = 0;
    for (const [key, oil] of lanternOil) {
      if (oil <= 0) continue;
      if (lightIdx >= LANTERN_POOL_SIZE) break;

      const parts = key.split('-');
      const deckIdx = parseInt(parts[0]);
      const tileX = parseInt(parts[1]);
      const tileY = parseInt(parts[2]);

      const light = lanternLights[lightIdx];
      light.visible = true;
      light.intensity = Math.min(1, oil / 20) * LANTERN_INTENSITY_SCALE;
      light.position.set(
        tileX - GRID_OFFSET_X,
        (2 - deckIdx) * DECK_HEIGHT + 0.6,
        tileY - GRID_OFFSET_Z,
      );
      lightIdx++;
    }

    // Disable unused lights
    for (let i = lightIdx; i < LANTERN_POOL_SIZE; i++) {
      lanternLights[i].visible = false;
      lanternLights[i].intensity = 0;
    }

    // Update lantern glass materials: swap lit/unlit appearance
    // This finds lantern meshes in the scene by name pattern
    // (done lazily — only updates if oil map changed)
    updateLanternGlassMaterials(ctx.scene, lanternOil);
  }

  return { lanternLights, update };
}

function updateLanternGlassMaterials(scene: THREE.Scene, lanternOil: Map<string, number>): void {
  scene.traverse((obj) => {
    if (obj.name.startsWith('lantern_')) {
      const parts = obj.name.split('_');
      const key = `${parts[1]}-${parts[2]}-${parts[3]}`;
      const oil = lanternOil.get(key) ?? 0;
      const glass = obj.getObjectByName('lanternGlass');
      if (glass instanceof THREE.Mesh) {
        glass.material = oil > 0 ? MAT.lanternGlassLit : MAT.lanternGlass;
      }
    }
  });
}
