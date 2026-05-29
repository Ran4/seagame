// SHARED SYSTEM A — Object / Hull damage module.
//
// Pure helpers operating on the World struct. Owned by Ship-to-Ship Combat but
// reused by Storms (sails tear, lightning strikes the mast) and Sea Monsters
// (tentacles smash hull/furniture). All per-tile HP lives in `world.objectHp`,
// keyed "deck-x-y" exactly like `barrelInventory` / `lanternOil`. A missing key
// means the tile is at full HP (lazy). Reaching 0 HP converts the tile:
//   HULL                         → BREACH  (a hole that floods the ship)
//   MAST/HELM/CANNON/furniture   → RUBBLE  (impassable wreckage)
// and ejects any crew that was using the destroyed tile.

import { World, TileType, OBJECT_MAX_HP, CrewState, TILE_SIZE, ActivityLogEntry, Actor } from './types';
import { createWood, createCannonball } from './items';
import { checkHuntContract } from './contracts';
import { createLootTreasureMap } from './treasure';
import type { AudioManager } from './audio';

// Flooding tuning. floodLevel is 0..100; at 100 the ship sinks.
// One breach raises the flood ~ FLOOD_RATE %/sec; with no breaches it drains slowly.
export const FLOOD_RATE = 0.6;        // % per second per breach on the lowest deck
export const FLOOD_DRAIN_RATE = 1.2;  // % per second the bilge pumps clear water when no breaches

// Combat range thresholds (leagues). Shared so the menu can gate the Board action.
export const CANNON_RANGE = 6;        // broadsides land within this distance
export const BOARD_RANGE = 1.2;       // ships adjacent enough to board (player can act a touch early)

const objKey = (deck: number, x: number, y: number) => `${deck}-${x}-${y}`;

/** Max HP for a damageable tile type (HULL = 120). 0 if the type has no HP entry. */
export function getObjectMaxHp(tileType: TileType): number {
  return OBJECT_MAX_HP[tileType] ?? 0;
}

/** Current HP of a placed tile. Lazy: absent key = full HP for that tile type. */
export function getObjectHp(world: World, deck: number, x: number, y: number): number {
  const key = objKey(deck, x, y);
  const stored = world.objectHp.get(key);
  if (stored !== undefined) return stored;
  const d = world.decks[deck];
  if (!d || y < 0 || y >= d.height || x < 0 || x >= d.width) return 0;
  return getObjectMaxHp(d.tiles[y][x]);
}

/** Eject any crew using the tile at (deck,x,y) — they drop to IDLE. */
function ejectCrewUsing(world: World, deck: number, x: number, y: number): void {
  for (const member of world.actors) {
    if (member.deck !== deck) continue;
    const mx = Math.floor(member.pixelX / TILE_SIZE);
    const my = Math.floor(member.pixelY / TILE_SIZE);
    // On the destroyed tile, or standing adjacent to it while working it.
    const onTile = mx === x && my === y;
    const adjacent = Math.abs(mx - x) + Math.abs(my - y) === 1;
    const workingState = member.state === CrewState.STEERING || member.state === CrewState.MANNING_CANNON ||
      member.state === CrewState.NAVIGATING || member.state === CrewState.LOOKOUT ||
      member.state === CrewState.REPAIRING || member.state === CrewState.FIGHTING ||
      member.state === CrewState.SLEEPING || member.state === CrewState.EATING;
    if (onTile || (adjacent && workingState)) {
      // If the crew was heading to / using the now-wrecked tile, snap them to idle.
      if (onTile || workingState) {
        member.path = [];
        member.copulationTarget = null;
        member.state = CrewState.IDLE;
        member.idleTimer = 0.5 + Math.random();
      }
    }
  }
}

/**
 * Damage a placed tile. Clamps HP to 0. On reaching 0:
 *  - HULL → BREACH (flooding source).
 *  - MAST/HELM/CANNON/STOVE/BED/BARREL/TABLE/MAP_TABLE/LANTERN → RUBBLE.
 * Crew using the destroyed tile are ejected to IDLE. Logs the destruction.
 */
export function damageObject(world: World, deck: number, x: number, y: number, amount: number, activityLog?: ActivityLogEntry[]): void {
  const d = world.decks[deck];
  if (!d || y < 0 || y >= d.height || x < 0 || x >= d.width) return;
  const tile = d.tiles[y][x];
  const maxHp = getObjectMaxHp(tile);
  if (maxHp <= 0) return; // not a damageable tile (FLOOR, WATER, already RUBBLE/BREACH, etc.)

  const key = objKey(deck, x, y);
  const cur = world.objectHp.get(key) ?? maxHp;
  const next = Math.max(0, cur - amount);

  if (next > 0) {
    world.objectHp.set(key, next);
    return;
  }

  // Destroyed — convert the tile.
  world.objectHp.delete(key); // BREACH/RUBBLE track their own HP lazily from here
  const log = activityLog ?? world.activityLog;
  if (tile === TileType.HULL) {
    d.tiles[y][x] = TileType.BREACH;
    ejectCrewUsing(world, deck, x, y);
    log.push({ text: 'A hull plank is breached — water is coming in!', time: world.time });
  } else {
    d.tiles[y][x] = TileType.RUBBLE;
    ejectCrewUsing(world, deck, x, y);
    const nameMap: Partial<Record<TileType, string>> = {
      [TileType.MAST]: 'The mast', [TileType.HELM]: 'The helm', [TileType.CANNON]: 'A cannon',
      [TileType.STOVE]: 'The stove', [TileType.BED]: 'A bunk', [TileType.BARREL]: 'A barrel',
      [TileType.TABLE]: 'A table', [TileType.MAP_TABLE]: 'The map table', [TileType.LANTERN]: 'A lantern',
    };
    log.push({ text: `${nameMap[tile] ?? 'Something'} is smashed to rubble!`, time: world.time });
  }
}

/**
 * Repair a damaged tile by `amount` HP. A BREACH being repaired converts back to
 * HULL as soon as HP rises above 0. Returns true when the tile reaches full HP.
 * The caller is responsible for consuming a Wood item (see crew/commands.ts).
 */
export function repairObject(world: World, deck: number, x: number, y: number, amount: number): boolean {
  const d = world.decks[deck];
  if (!d || y < 0 || y >= d.height || x < 0 || x >= d.width) return false;
  let tile = d.tiles[y][x];
  const key = objKey(deck, x, y);

  // A breach: patching it turns it back into hull (starting at low HP).
  if (tile === TileType.BREACH) {
    d.tiles[y][x] = TileType.HULL;
    tile = TileType.HULL;
    world.objectHp.set(key, 0); // will be raised below
  }

  const maxHp = getObjectMaxHp(tile);
  if (maxHp <= 0) return true; // not repairable (e.g. RUBBLE) — treat as "done"

  const cur = world.objectHp.get(key) ?? maxHp;
  const next = Math.min(maxHp, cur + amount);
  if (next >= maxHp) {
    world.objectHp.delete(key); // back to full → drop the key (lazy-full)
    return true;
  }
  world.objectHp.set(key, next);
  return false;
}

/** Count BREACH tiles on the lowest deck (closest to the waterline). */
export function countBreaches(world: World): number {
  const lowest = world.decks.length - 1;
  const d = world.decks[lowest];
  if (!d) return 0;
  let n = 0;
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      if (d.tiles[y][x] === TileType.BREACH) n++;
    }
  }
  return n;
}

/**
 * Advance the flooding simulation. Rising flood from breaches on the lowest deck;
 * slow drain when there are none. At >= 100 the ship sinks: sets a game-over reason
 * and flips mutinyState to 'game_over' (the existing full-stop end state).
 *
 * `allowRise` (default true) gates the rising half: while docked we keep the bilge
 * pumps draining (so floodLevel doesn't freeze in port) but never let the water rise
 * — you can't sink at a wharf, and harbor hull repairs are the intended way to clear
 * breaches in port.
 */
export function updateFlooding(world: World, dt: number, allowRise: boolean = true): void {
  const breaches = countBreaches(world);
  if (breaches > 0 && allowRise) {
    world.floodLevel = Math.min(100, world.floodLevel + breaches * FLOOD_RATE * dt);
  } else if (world.floodLevel > 0 && (breaches === 0 || !allowRise)) {
    world.floodLevel = Math.max(0, world.floodLevel - FLOOD_DRAIN_RATE * dt);
  }
  if (world.floodLevel >= 100 && world.mutinyState !== 'game_over') {
    world.gameOverReason = 'Your ship sank!';
    world.mutinyState = 'game_over';
    world.activityLog.push({ text: 'The ship has flooded and gone under!', time: world.time });
  }
}

/** True if a MAST tile still stands anywhere on the ship (sailing requires it). */
export function hasIntactMast(world: World): boolean {
  return world.decks.some(d => d.tiles.some(row => row.includes(TileType.MAST)));
}

/** True if a HELM tile still stands anywhere on the ship (steering requires it). */
export function hasIntactHelm(world: World): boolean {
  return world.decks.some(d => d.tiles.some(row => row.includes(TileType.HELM)));
}

// --- Combat actions shared by the per-frame loop (game.ts) and commands (crew/commands.ts) ---

/** Average combat readiness of a crew member (skill + how fed/rested they are). */
export function combatRating(member: Actor): number {
  const skill = (member.skills.combat ?? 30);
  const fed = member.profile.hunger / 255;
  const rested = member.profile.energy / 255;
  let r = skill * (0.6 + 0.4 * ((fed + rested) / 2));
  if (member.conditions.has('injured')) r *= 0.5;
  if (member.conditions.has('bruised')) r *= 0.85;
  return r;
}

/** First BARREL tile key ("deck-x-y") on the ship, for stashing loot. */
export function findFirstBarrelKey(world: World): string | null {
  for (let d = 0; d < world.decks.length; d++) {
    const deck = world.decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === TileType.BARREL) return `${d}-${x}-${y}`;
      }
    }
  }
  return null;
}

/** Consume one Cannonball from any barrel, if present. Returns true if one was spent. */
function consumeCannonball(world: World): boolean {
  for (const [key, items] of world.barrelInventory) {
    const idx = items.findIndex(i => i.name === 'Cannonball');
    if (idx === -1) continue;
    const ball = items[idx];
    if (ball.stackable && ball.quantity > 1) { ball.quantity--; ball.weight -= 5000; }
    else items.splice(idx, 1);
    if (items.length === 0) world.barrelInventory.delete(key);
    return true;
  }
  return false;
}

/**
 * A friendly cannon volley (auto-fire from manned cannons OR a manual FireCannon order).
 * Damages the enemy, consumes a Cannonball if one is available. Logs + plays SFX.
 */
export function fireFriendlyVolley(world: World, audio: AudioManager | undefined, gunners: Actor[]): void {
  const enemy = world.enemyShip;
  if (!enemy) return;
  if (enemy.hp <= 0) return; // already a wreck — don't waste shots/ammo or re-log its death
  consumeCannonball(world);
  let dmg = 0;
  for (const g of gunners) dmg += 6 + (g.skills.gunnery ?? 0) / 20 + Math.random() * 6;
  if (gunners.length === 0) dmg = 4 + Math.random() * 6; // a lone manual shot
  dmg = Math.round(dmg);
  enemy.hp = Math.max(0, enemy.hp - dmg);
  world.activityLog.push({ text: `Broadside hits the ${enemy.name} for ${dmg} damage!`, time: world.time });
  if (audio) audio.play('cannon_fire', world.activeDeck);
  if (enemy.hp <= 0) {
    enemy.hostile = false;
    world.activityLog.push({ text: `The ${enemy.name} is crippled and dead in the water!`, time: world.time });
    // FEATURE 7 — sinking the marked ship by gunfire also satisfies a 'hunt' contract
    // (you don't have to board it). Guarded so it only fires once as hp first hits 0.
    const activeBefore = world.contracts.filter(c => c.status === 'active').length;
    checkHuntContract(world, enemy.name);
    const activeAfter = world.contracts.filter(c => c.status === 'active').length;
    if (audio && activeAfter < activeBefore) audio.play('contract_complete', world.activeDeck);
  }
}

/** The enemy fires back: damages random ship tiles + may injure/kill crew on that deck. */
export function enemyVolley(world: World, audio: AudioManager | undefined): void {
  const enemy = world.enemyShip;
  if (!enemy) return;
  if (audio) audio.play('cannon_fire', world.activeDeck);
  world.activityLog.push({ text: `The ${enemy.name} fires a broadside!`, time: world.time });

  const hits = 1 + Math.floor(Math.random() * 3);
  for (let h = 0; h < hits; h++) {
    const targets: { deck: number; x: number; y: number }[] = [];
    for (let d = 0; d < world.decks.length; d++) {
      const deck = world.decks[d];
      for (let y = 0; y < deck.height; y++) {
        for (let x = 0; x < deck.width; x++) {
          if (getObjectMaxHp(deck.tiles[y][x]) > 0) targets.push({ deck: d, x, y });
        }
      }
    }
    if (targets.length === 0) break;
    const t = targets[Math.floor(Math.random() * targets.length)];
    damageObject(world, t.deck, t.x, t.y, 25 + Math.floor(Math.random() * 30), world.activityLog);
    if (audio) audio.play('ship_hit', world.activeDeck); // shot lands on our hull/objects

    if (Math.random() < 0.5) {
      const onDeck = world.actors.filter(a => a.deck === t.deck && a.actorType === 'human' && !a.statuses.has('npc'));
      if (onDeck.length > 0) {
        const victim = onDeck[Math.floor(Math.random() * onDeck.length)];
        const dmg = 20 + Math.floor(Math.random() * 30);
        victim.health = Math.max(0, victim.health - dmg);
        if (victim.health <= 0) {
          world.activityLog.push({ text: `${victim.profile.name} was killed by enemy fire!`, time: world.time });
        } else {
          victim.statuses.set('injured', { severity: victim.health < 32 ? 2 : 1 });
          victim.speechBubbleText = 'Aaargh! I\'m hit!';
          victim.speechBubbleTimer = 3;
          world.activityLog.push({ text: `${victim.profile.name} is injured by enemy fire!`, time: world.time });
        }
      }
    }
  }
}

/**
 * Resolve a boarding action abstractly: a series of 1v1 stat-comparison duels across
 * min(crew, enemyCrew). On victory, capture the enemy and add loot (gold + supplies +
 * occasional treasure-map placeholder). Brief FIGHTING state for flavor.
 */
export function resolveBoarding(world: World, audio: AudioManager | undefined): void {
  const enemy = world.enemyShip;
  if (!enemy) return;
  const fighters = world.actors.filter(a => a.actorType === 'human' && !a.statuses.has('npc') && a.health > 0);
  if (fighters.length === 0) { world.activityLog.push({ text: 'No crew able to board!', time: world.time }); return; }

  if (audio) audio.play('fist_fight', world.activeDeck);
  const duels = Math.min(fighters.length, enemy.crewCount);
  let ourWins = 0, theirWins = 0;
  for (let i = 0; i < duels; i++) {
    const f = fighters[i];
    f.state = CrewState.FIGHTING;
    f.stateTimer = 2;
    f.path = [];
    const ourRoll = combatRating(f) + Math.random() * 60;
    const theirRoll = 40 + Math.random() * 80;
    if (ourRoll >= theirRoll) {
      ourWins++;
    } else {
      theirWins++;
      const dmg = 25 + Math.floor(Math.random() * 30);
      f.health = Math.max(1, f.health - dmg);
      f.statuses.set('injured', { severity: f.health < 32 ? 2 : 1 });
    }
  }
  if (enemy.crewCount > duels) theirWins += enemy.crewCount - duels;

  if (ourWins >= theirWins) {
    const goldLoot = 40 + Math.floor(Math.random() * 80) + enemy.maxHp;
    world.gold += goldLoot;
    const barrelKey = findFirstBarrelKey(world);
    if (barrelKey) {
      const items = world.barrelInventory.get(barrelKey) ?? [];
      const wood = createWood(world.time); wood.quantity = 3; wood.weight = 2000 * 3;
      const balls = createCannonball(world.time); balls.quantity = 4; balls.weight = 5000 * 4;
      items.push(wood, balls);
      if (Math.random() < 0.35) {
        // FEATURE 8 — a real captured treasure map pointing to a random island.
        items.push(createLootTreasureMap(world));
        world.activityLog.push({ text: 'Among the plunder: a weathered treasure map! Read it at the map table.', time: world.time });
      }
      world.barrelInventory.set(barrelKey, items);
    }
    world.activityLog.push({ text: `Boarding successful! Captured the ${enemy.name} — ${goldLoot} gold and supplies seized.`, time: world.time });
    // FEATURE 7 — a defeated enemy may satisfy an active 'hunt' contract.
    const activeBefore = world.contracts.filter(c => c.status === 'active').length;
    checkHuntContract(world, enemy.name);
    const activeAfter = world.contracts.filter(c => c.status === 'active').length;
    if (audio && activeAfter < activeBefore) audio.play('contract_complete', world.activeDeck);
    world.enemyShip = null;
  } else {
    world.activityLog.push({ text: `The boarding was repelled by the ${enemy.name}'s crew!`, time: world.time });
  }
}
