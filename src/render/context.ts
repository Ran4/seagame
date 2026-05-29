import { Camera, Item, WeatherState } from '../types';
import { SpriteSheet } from '../sprites';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  sprites: SpriteSheet | null;
  mousePos: { x: number; y: number };
  lanternOil: Map<string, number>;
  brightness: number;
  camera: Camera;
  deckIndex: number;
  hoveredItem: { item: Item; x: number; y: number } | null;
  hoveredBarTooltip: string[] | null;
  weather: WeatherState;            // FEATURE 5 — storm darkening / rain / flash + HUD
}
