// FEATURE 5 — Storms & Weather.
//
// A small weather state machine ticked from the sailing block of update() (game.ts),
// plus the per-frame storm effects on crew + ship. Reuses SHARED SYSTEM A
// (damageObject) for torn sails / lightning strikes, and SHARED SYSTEM C
// (isInDeepWater) to make the open ocean stormier. Rendering lives in renderer.ts —
// this module only mutates World (the renderer stays pure).
//
// Time scale: 1 in-game hour = 30s (SECONDS_PER_DAY / 24). A storm lasts 2–5 in-game
// hours = 60–150s, matching the spec.

import { World, CrewState, TileType, TILE_SIZE, Actor } from './types';
import { damageObject } from './combat';
import { isInDeepWater } from './worldmap';
import { CONFIG } from './config';
import type { AudioManager } from './audio';

const HOUR = 30; // seconds per in-game hour (SECONDS_PER_DAY 720 / 24)

// --- State-machine durations (seconds) ---
export const WEATHER_CLEAR_DURATION = 6 * HOUR;   // ~180s of clear before re-rolling
const WEATHER_CLOUDY_DURATION = 2 * HOUR;         // ~60s of cloud build-up / fade
const STORM_MIN = 2 * HOUR;                        // 60s
const STORM_MAX = 5 * HOUR;                        // 150s

// Transition probabilities (rolled when a state's timer elapses).
const CLEAR_TO_CLOUDY = 0.5;   // open weather often clouds over
const CLOUDY_TO_STORM = 0.5;   // clouds may build into a storm...
const CLOUDY_TO_CLEAR = 0.35;  // ...or blow over (remainder: stay cloudy another spell)
const DEEP_WATER_STORM_BONUS = 0.25; // open ocean is stormier

// Intensity ramp (per second). Storms ramp up; everything else ramps down.
const INTENSITY_RAMP_UP = 0.12;
const INTENSITY_RAMP_DOWN = 0.18;

// Lightning flash decay (per second). A flash spikes to ~1 then fades.
const FLASH_DECAY = 2.5;

// --- Effect tuning ---
const STORM_MORALE_DRAIN = 1.2;        // morale/sec lost during a storm (scaled by intensity)
const WET_EXTRA_DURATION = 4 * HOUR;   // 'wet' lingers ~2 in-game hours after the storm ends
const SPLASH_CHANCE = 0.04;            // per upper-deck crew per second to get soaked
const LANTERN_BLOWOUT_CHANCE = 0.02;   // per lit lantern per second to be snuffed
const SAIL_TEAR_CHANCE = 0.015;        // per second to damage a random standing mast
const SAIL_TEAR_DAMAGE_MIN = 8;
const SAIL_TEAR_DAMAGE_MAX = 22;
const LIGHTNING_CHANCE = 0.012;        // per second during a storm (scaled by intensity)
const LIGHTNING_MAST_DAMAGE_MIN = 30;
const LIGHTNING_MAST_DAMAGE_MAX = 60;
const LIGHTNING_CREW_RADIUS = 3;       // tiles from the struck mast that crew get hurt
const LIGHTNING_CREW_DAMAGE_MIN = 20;
const LIGHTNING_CREW_DAMAGE_MAX = 40;

// Morale thresholds for crew reactions to the storm.
const FLEE_MORALE = 64;     // below this → may flee below deck
const PRAY_MORALE = 96;     // below this (but >= FLEE) → may pray on the spot
const FLEE_CHANCE = 0.01;   // per idle decision, per qualifying crew
const PRAY_CHANCE = 0.012;
const REFUSE_ORDER_CHANCE = 0.6; // chance a fearful crew refuses a fresh work order in a storm

const FEARFUL_LINES = ['We\'re all doomed!', 'The sea\'ll swallow us!', 'Get me off this ship!', 'Lord, save us!'];
const PRAYER_LINES = ['Have mercy...', 'Spare us, O Lord...', 'Save our souls...', '*prays fervently*'];

const STATE_NAMES_FOR_LOG: Record<WeatherStateName, string> = {
  clear: 'The skies clear.',
  cloudy: 'Clouds gather on the horizon.',
  storm: 'A storm rolls in!',
};

type WeatherStateName = 'clear' | 'cloudy' | 'storm';

function rollStormDuration(): number {
  return STORM_MIN + Math.random() * (STORM_MAX - STORM_MIN);
}

/** True if a deck is exposed to the open sky (crow's nest + upper deck). The lowest
 * deck is "below deck" and sheltered from rain/lightning/splashes. */
export function isExposedDeck(world: World, deck: number): boolean {
  return deck < world.decks.length - 1;
}

/** Index of the deck crew flee to (the lowest / most sheltered). */
function shelterDeck(world: World): number {
  return world.decks.length - 1;
}

/**
 * Advance the weather state machine + ramp intensity. Called once per frame from the
 * sailing block in update() (so it only runs at sea, like combat/navigation).
 * `dt` is real seconds. Logs transitions to the activity log.
 */
export function updateWeather(world: World, dt: number, audio?: AudioManager): void {
  const w = world.weather;

  // Test aid: forceStorm config kicks an immediate storm once at sea.
  if (CONFIG.forceStorm) {
    CONFIG.forceStorm = false;
    enterState(world, 'storm', audio);
  }

  // Lightning flash always decays (even between storms, harmless).
  if (w.lightningFlash > 0) {
    w.lightningFlash = Math.max(0, w.lightningFlash - FLASH_DECAY * dt);
  }

  // Intensity ramp toward target (1 during a storm, 0 otherwise).
  const targetIntensity = w.state === 'storm' ? 1 : 0;
  if (w.intensity < targetIntensity) {
    w.intensity = Math.min(targetIntensity, w.intensity + INTENSITY_RAMP_UP * dt);
  } else if (w.intensity > targetIntensity) {
    w.intensity = Math.max(targetIntensity, w.intensity - INTENSITY_RAMP_DOWN * dt);
  }

  // State timer → transition roll.
  w.timer -= dt;
  if (w.timer <= 0) {
    const deepBonus = isInDeepWater(world.worldMap) ? DEEP_WATER_STORM_BONUS : 0;
    if (w.state === 'clear') {
      if (Math.random() < CLEAR_TO_CLOUDY + deepBonus) enterState(world, 'cloudy', audio);
      else w.timer = WEATHER_CLEAR_DURATION; // stay clear another spell
    } else if (w.state === 'cloudy') {
      // Roll storm first, then split what's left between clearing and lingering at the
      // base ratio — keeps the deep-water bonus from pushing the total past 1 and
      // eating the linger band.
      const clearShare = CLOUDY_TO_CLEAR / (1 - CLOUDY_TO_STORM);
      if (Math.random() < CLOUDY_TO_STORM + deepBonus) enterState(world, 'storm', audio);
      else if (Math.random() < clearShare) enterState(world, 'clear', audio);
      else w.timer = WEATHER_CLOUDY_DURATION; // lingers cloudy
    } else { // storm
      // Storms blow over into cloudy skies (clouds then clear normally).
      enterState(world, 'cloudy', audio);
    }
  }

  // While storming, apply the gameplay effects.
  if (w.state === 'storm') {
    applyStormEffects(world, dt, audio);
  }
}

function enterState(world: World, next: WeatherStateName, audio?: AudioManager): void {
  const w = world.weather;
  if (w.state === next && next !== 'storm') return;
  w.state = next;
  w.timer = next === 'storm' ? rollStormDuration()
          : next === 'cloudy' ? WEATHER_CLOUDY_DURATION
          : WEATHER_CLEAR_DURATION;
  world.activityLog.push({ text: STATE_NAMES_FOR_LOG[next], time: world.time });
  if (next === 'storm' && audio) audio.play('rain', world.activeDeck);
}

/** Per-frame storm effects: morale drain, soaking, lanterns, torn sails, lightning, helm wobble. */
function applyStormEffects(world: World, dt: number, audio?: AudioManager): void {
  const intensity = world.weather.intensity;
  if (intensity <= 0.05) return; // storm only just starting / fading — hold off

  // --- Crew effects ---
  for (const member of world.actors) {
    if (member.actorType !== 'human') continue;
    if (member.statuses.has('npc')) continue;

    const exposed = isExposedDeck(world, member.deck);

    // Morale drain (worse when exposed on deck in the weather).
    const drain = STORM_MORALE_DRAIN * intensity * dt * (exposed ? 1.0 : 0.5);
    member.profile.morale = Math.max(0, member.profile.morale - drain);

    // Splashes soak exposed crew → 'wet' status (move slower; expires after the storm).
    if (exposed && Math.random() < SPLASH_CHANCE * intensity * dt) {
      member.statuses.set('wet', { until: world.time + WET_EXTRA_DURATION });
    }
  }

  // --- Lanterns randomly blow out (gusts snuff the flame). ---
  for (const [key, oil] of world.lanternOil) {
    if (oil <= 0) continue;
    if (Math.random() < LANTERN_BLOWOUT_CHANCE * intensity * dt) {
      world.lanternOil.set(key, 0);
    }
  }

  // --- Sails tear: occasionally damage a standing mast. ---
  if (Math.random() < SAIL_TEAR_CHANCE * intensity * dt) {
    const mast = pickRandomMast(world);
    if (mast) {
      const dmg = SAIL_TEAR_DAMAGE_MIN + Math.floor(Math.random() * (SAIL_TEAR_DAMAGE_MAX - SAIL_TEAR_DAMAGE_MIN));
      damageObject(world, mast.deck, mast.x, mast.y, dmg, world.activityLog);
      world.activityLog.push({ text: 'A sail tears in the gale!', time: world.time });
    }
  }

  // --- Lightning strike: rare, devastating. ---
  if (Math.random() < LIGHTNING_CHANCE * intensity * dt) {
    strikeLightning(world, audio);
  }

  // --- Steering harder: a struggling helmsman lets the heading wander a touch. ---
  // Scaled by dt so the yaw slop is frame-rate independent.
  const helmsman = world.actors.find(c => c.state === CrewState.STEERING && c.actorType === 'human');
  if (helmsman) {
    const wobble = (Math.random() - 0.5) * 0.6 * intensity * dt; // radians of yaw slop per second
    world.worldMap.currentHeading += wobble;
  }
}

/** Pick a random standing MAST tile anywhere on the ship, or null if none remain. */
function pickRandomMast(world: World): { deck: number; x: number; y: number } | null {
  const masts: { deck: number; x: number; y: number }[] = [];
  for (let d = 0; d < world.decks.length; d++) {
    const deck = world.decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === TileType.MAST) masts.push({ deck: d, x, y });
      }
    }
  }
  if (masts.length === 0) return null;
  return masts[Math.floor(Math.random() * masts.length)];
}

/**
 * A lightning strike hits a mast: heavy damage to the mast + a bright flash + thunder,
 * and injures any crew on an exposed deck near the struck mast. Fire is kept simple —
 * just a damage event (no persistent fire-spread system).
 */
function strikeLightning(world: World, audio?: AudioManager): void {
  const mast = pickRandomMast(world);
  world.weather.lightningFlash = 1.0; // full-bright white flash this frame
  if (audio) { audio.play('lightning', world.activeDeck); audio.play('thunder', world.activeDeck); }

  if (!mast) {
    world.activityLog.push({ text: 'Lightning splits the sky!', time: world.time });
    return;
  }

  const dmg = LIGHTNING_MAST_DAMAGE_MIN + Math.floor(Math.random() * (LIGHTNING_MAST_DAMAGE_MAX - LIGHTNING_MAST_DAMAGE_MIN));
  damageObject(world, mast.deck, mast.x, mast.y, dmg, world.activityLog);
  world.activityLog.push({ text: 'Lightning strikes the mast!', time: world.time });

  // Injure exposed crew near the struck mast (same deck or the deck directly below it).
  for (const member of world.actors) {
    if (member.actorType !== 'human' || member.statuses.has('npc')) continue;
    if (!isExposedDeck(world, member.deck)) continue;
    const mx = Math.floor(member.pixelX / TILE_SIZE);
    const my = Math.floor(member.pixelY / TILE_SIZE);
    const near = Math.abs(mx - mast.x) + Math.abs(my - mast.y) <= LIGHTNING_CREW_RADIUS;
    // Crew on a different exposed deck count if they're roughly under the strike.
    if (!near) continue;
    const hurt = LIGHTNING_CREW_DAMAGE_MIN + Math.floor(Math.random() * (LIGHTNING_CREW_DAMAGE_MAX - LIGHTNING_CREW_DAMAGE_MIN));
    member.health = Math.max(0, member.health - hurt);
    if (member.health <= 0) {
      world.activityLog.push({ text: `${member.profile.name} was struck down by lightning!`, time: world.time });
    } else {
      member.statuses.set('injured', { severity: member.health < 32 ? 2 : 1 });
      member.speechBubbleText = 'Aaargh! The lightning!';
      member.speechBubbleTimer = 3;
      world.activityLog.push({ text: `${member.profile.name} is hurt by a lightning strike!`, time: world.time });
    }
  }
}

// ---------------------------------------------------------------------------
// Crew storm reactions (called from the idle handler in crew/update.ts).
// ---------------------------------------------------------------------------

/**
 * In a storm, a fearful (low-morale) crew member may flee below deck or pray.
 * Returns true if it set a behaviour (caller should not fall through to wander).
 * High-morale crew stay at their posts (return false).
 */
export function tryStormReaction(member: Actor, world: World, orderBelow: (m: Actor, deck: number) => boolean): boolean {
  if (world.weather.state !== 'storm' || world.weather.intensity < 0.4) return false;
  if (member.actorType !== 'human' || member.statuses.has('npc')) return false;

  const morale = member.profile.morale;

  // Terrified → bolt for the safety of the lowest deck.
  if (morale < FLEE_MORALE && Math.random() < FLEE_CHANCE) {
    const deck = shelterDeck(world);
    if (member.deck !== deck && orderBelow(member, deck)) {
      member.targetState = CrewState.FLEEING;
      member.speechBubbleText = FEARFUL_LINES[Math.floor(Math.random() * FEARFUL_LINES.length)];
      member.speechBubbleTimer = 3;
      return true;
    }
    // Already below — cower/pray in place.
    member.state = CrewState.PRAYING;
    member.stateTimer = 6 + Math.random() * 6;
    member.path = [];
    member.thoughtBubble = 'prayer';
    member.thoughtBubbleTimer = member.stateTimer;
    member.speechBubbleText = PRAYER_LINES[Math.floor(Math.random() * PRAYER_LINES.length)];
    member.speechBubbleTimer = 3;
    return true;
  }

  // Frightened → drop to knees and pray on the spot.
  if (morale < PRAY_MORALE && Math.random() < PRAY_CHANCE) {
    member.state = CrewState.PRAYING;
    member.stateTimer = 6 + Math.random() * 8;
    member.path = [];
    member.thoughtBubble = 'prayer';
    member.thoughtBubbleTimer = member.stateTimer;
    member.speechBubbleText = PRAYER_LINES[Math.floor(Math.random() * PRAYER_LINES.length)];
    member.speechBubbleTimer = 3;
    return true;
  }

  return false;
}

/** Would this fearful crew member refuse a fresh work order because of the storm?
 * Only low-morale crew balk; brave crew obey. */
export function refusesOrderInStorm(member: Actor, world: World): boolean {
  if (world.weather.state !== 'storm' || world.weather.intensity < 0.4) return false;
  if (member.profile.morale >= PRAY_MORALE) return false;
  if (Math.random() >= REFUSE_ORDER_CHANCE) return false;
  member.speechBubbleText = 'I\'ll not go up there in this!';
  member.speechBubbleTimer = 3;
  return true;
}
