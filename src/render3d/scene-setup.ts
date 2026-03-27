import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight;
}

const SKY_COLOR = 0x7ec8e3;

export function createSceneContext(canvas: HTMLCanvasElement, width: number, height: number): SceneContext {
  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.FogExp2(SKY_COLOR, 0.008);

  // Camera
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 300);
  // Default view: isometric-ish looking down at the upper deck
  camera.position.set(12, 14, 12);

  // WebGL Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // Controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 3;
  controls.maxDistance = 55;
  controls.target.set(0, 1.0, 0);
  // Smooth zoom
  controls.zoomSpeed = 0.8;

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x444422, 0.55);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.3);
  sun.position.set(12, 20, -8);
  sun.castShadow = true;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -10;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0002;
  scene.add(sun);

  return { scene, camera, renderer, controls, sun, ambient, hemisphere };
}

export function resizeSceneContext(ctx: SceneContext, width: number, height: number): void {
  ctx.camera.aspect = width / height;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer.setSize(width, height);
}
