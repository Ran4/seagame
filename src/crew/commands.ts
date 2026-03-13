import { Actor, CrewState, DeckPoint, Deck, TileType, WALKABLE, TILE_SIZE, Command, ActivityLogEntry, World } from '../types';
import { stopConversation } from '../conversation';
import { createSemen } from '../items';
import { orderCrewTo, orderCrewToAdjacentTile, orderCrewBesideTile } from './movement';
import { AudioManager } from '../audio';

export const DRINK_DURATION = 5;

function findTilesOfType(decks: Deck[], type: TileType): DeckPoint[] {
  const results: DeckPoint[] = [];
  for (let d = 0; d < decks.length; d++) {
    const deck = decks[d];
    for (let y = 0; y < deck.height; y++) {
      for (let x = 0; x < deck.width; x++) {
        if (deck.tiles[y][x] === type) {
          results.push({ x, y, deck: d });
        }
      }
    }
  }
  return results;
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function findTileOrRandom(decks: Deck[], type: TileType, pos: { deck?: number; x?: number; y?: number }): DeckPoint | undefined {
  if (pos.x !== undefined && pos.y !== undefined) {
    return { x: pos.x, y: pos.y, deck: pos.deck ?? 0 };
  }
  return pickRandom(findTilesOfType(decks, type));
}

export function tryExecuteCommand(member: Actor, decks: Deck[], crew: Actor[], activityLog: ActivityLogEntry[], gameTime: number, world?: World, audio?: AudioManager): boolean {
  if (member.commandQueue.length === 0) return false;

  const cmd = member.commandQueue[0];
  const name = member.profile.name;

  // Order refusal: low morale crew may refuse commands
  if (member.profile.morale < 64 && cmd.name !== 'Stop' && Math.random() < 0.5) {
    activityLog.push({ text: `${name} refuses — low morale`, time: gameTime });
    member.commandQueue.shift();
    member.commandQueue.length = 0;
    return true;
  }

  const fail = (reason: string) => {
    activityLog.push({ text: `${name}: ${cmd.name} failed — ${reason}`, time: gameTime });
    member.commandQueue.length = 0; // drop entire chain
  };

  const log = (text: string) => {
    activityLog.push({ text: `${name}: ${text}`, time: gameTime });
  };

  // Helper for actor-targeting commands (Kiss, Copulate, Pet, Converse)
  const setupActorTarget = (actorId: number, targetState: CrewState, beside: boolean): boolean => {
    const target = crew.find(c => c.id === actorId);
    if (!target) { fail(`actor ${actorId} not found`); return true; }
    member.copulationTarget = { type: 'crew', actorId: target.id };
    target.copulationTarget = { type: 'crew', actorId: member.id };
    target.state = CrewState.IDLE;
    target.path = [];
    target.idleTimer = 999;
    const targetTile = { x: Math.floor(target.pixelX / TILE_SIZE), y: Math.floor(target.pixelY / TILE_SIZE), deck: target.deck };
    const ok = beside
      ? orderCrewBesideTile(member, targetTile, decks, targetState)
      : orderCrewToAdjacentTile(member, targetTile, decks, targetState);
    if (!ok) {
      member.copulationTarget = null;
      target.copulationTarget = null;
      target.idleTimer = 1 + Math.random() * 2;
      fail(`can't reach ${target.profile.name}`);
    }
    return true;
  };

  // Remove the command we're about to execute
  member.commandQueue.shift();

  switch (cmd.name) {
    case 'Sleep': {
      const target = findTileOrRandom(decks, TileType.BED, cmd);
      if (!target) { fail('no bed found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.SLEEPING)) { fail('can\'t reach bed'); return true; }
      log('going to sleep');
      return true;
    }
    case 'Eat': {
      const target = findTileOrRandom(decks, TileType.STOVE, cmd);
      if (!target) { fail('no stove found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.EATING)) { fail('can\'t reach stove'); return true; }
      log('going to eat');
      return true;
    }
    case 'Steer': {
      const target = findTileOrRandom(decks, TileType.HELM, cmd);
      if (!target) { fail('no helm found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.STEERING)) { fail('can\'t reach helm'); return true; }
      log('going to steer');
      return true;
    }
    case 'Navigate': {
      const target = findTileOrRandom(decks, TileType.MAP_TABLE, cmd);
      if (!target) { fail('no map table found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.NAVIGATING)) { fail('can\'t reach map table'); return true; }
      log('going to navigate');
      return true;
    }
    case 'ManCannon': {
      const target = findTileOrRandom(decks, TileType.CANNON, cmd);
      if (!target) { fail('no cannon found'); return true; }
      if (!orderCrewToAdjacentTile(member, target, decks, CrewState.MANNING_CANNON)) { fail('can\'t reach cannon'); return true; }
      log('going to man cannon');
      return true;
    }
    case 'Lookout': {
      const masts = findTilesOfType(decks, TileType.MAST);
      const target = (cmd.x !== undefined && cmd.y !== undefined)
        ? { x: cmd.x, y: cmd.y, deck: cmd.deck ?? 0 }
        : pickRandom(masts);
      if (!target) { fail('no mast found'); return true; }
      const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      let reached = false;
      for (const [dx, dy] of DIRS) {
        if (orderCrewTo(member, { x: target.x + dx, y: target.y + dy, deck: target.deck }, decks, CrewState.LOOKOUT)) {
          reached = true;
          break;
        }
      }
      if (!reached) { fail('can\'t reach mast'); return true; }
      log('going to lookout');
      return true;
    }
    case 'Kiss': {
      setupActorTarget(cmd.actorId, CrewState.KISSING, true);
      if (member.copulationTarget) log(`going to kiss ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'Copulate': {
      setupActorTarget(cmd.actorId, CrewState.COPULATING, false);
      if (member.copulationTarget) log(`going to copulate with ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'CopulateBarrel': {
      member.copulationTarget = { type: 'barrel', x: cmd.x, y: cmd.y, deck: cmd.deck };
      if (!orderCrewToAdjacentTile(member, { x: cmd.x, y: cmd.y, deck: cmd.deck }, decks, CrewState.COPULATING)) {
        member.copulationTarget = null;
        fail('can\'t reach barrel');
        return true;
      }
      log('going to copulate with barrel');
      return true;
    }
    case 'Pet': {
      setupActorTarget(cmd.actorId, CrewState.PETTING, true);
      if (member.copulationTarget) log(`going to pet ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'Converse': {
      setupActorTarget(cmd.actorId, CrewState.TALKING, true);
      if (member.copulationTarget) log(`going to talk to ${crew.find(c => c.id === cmd.actorId)?.profile.name}`);
      return true;
    }
    case 'GoTo': {
      const deck = cmd.deck ?? member.deck;
      if (!orderCrewTo(member, { x: cmd.x, y: cmd.y, deck }, decks)) { fail(`can't reach (${cmd.x},${cmd.y},${deck})`); return true; }
      log(`going to (${cmd.x},${cmd.y},${deck})`);
      return true;
    }
    case 'GoToDeck': {
      const targetDeckIdx = cmd.deck;
      const targetDeck = decks[targetDeckIdx];
      if (!targetDeck) { fail(`deck ${targetDeckIdx} doesn't exist`); return true; }
      let reached = false;
      for (let y = 0; y < targetDeck.height && !reached; y++) {
        for (let x = 0; x < targetDeck.width && !reached; x++) {
          if (WALKABLE.has(targetDeck.tiles[y][x])) {
            if (orderCrewTo(member, { x, y, deck: targetDeckIdx }, decks)) {
              reached = true;
            }
          }
        }
      }
      if (!reached) { fail(`can't reach deck ${targetDeckIdx}`); return true; }
      log(`going to ${targetDeck.name}`);
      return true;
    }
    case 'TakeItem': {
      const parts = cmd.barrelKey.split('-').map(Number);
      const [d, bx, by] = parts;
      member.takeTarget = { barrelKey: cmd.barrelKey, itemName: cmd.itemName };
      if (!orderCrewToAdjacentTile(member, { x: bx, y: by, deck: d }, decks, CrewState.TAKING_ITEM)) {
        member.takeTarget = null;
        fail('can\'t reach barrel');
        return true;
      }
      log(`going to take ${cmd.itemName}`);
      return true;
    }
    case 'Drink': {
      const drinkName = cmd.itemName ?? 'Grog ration';
      const grogIdx = member.profile.inventory.findIndex(i => i.name === drinkName);
      if (grogIdx === -1) { fail(`no ${drinkName} in inventory`); return true; }
      const item = member.profile.inventory.splice(grogIdx, 1)[0];
      member.state = CrewState.DRINKING;
      member.stateTimer = DRINK_DURATION;
      member.consumingItem = item;
      member.path = [];
      log(`drinking ${drinkName}`);
      return true;
    }
    case 'LightLantern': {
      if (!orderCrewToAdjacentTile(member, { x: cmd.x, y: cmd.y, deck: cmd.deck }, decks, CrewState.LIGHTING_LANTERN)) {
        fail('can\'t reach lantern');
        return true;
      }
      log('going to light lantern');
      return true;
    }
    case 'ExtinguishLantern': {
      if (!orderCrewToAdjacentTile(member, { x: cmd.x, y: cmd.y, deck: cmd.deck }, decks, CrewState.EXTINGUISHING_LANTERN)) {
        fail('can\'t reach lantern');
        return true;
      }
      log('going to extinguish lantern');
      return true;
    }
    case 'Sing': {
      // Gather nearby idle/wandering humans on same deck
      const SING_MAX = 5;
      const SING_DEFAULT_DURATION = 30;
      const singers: Actor[] = [member];
      for (const c of crew) {
        if (singers.length >= SING_MAX) break;
        if (c.id === member.id || c.actorType !== 'human' || c.deck !== member.deck) continue;
        if (c.state === CrewState.IDLE || (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE)) {
          singers.push(c);
        }
      }
      if (singers.length < 2) { fail('not enough crew nearby to sing'); return true; }
      const duration = audio?.shantyDuration || SING_DEFAULT_DURATION;
      const maleCount = singers.filter(s => s.profile.sex === 'M').length;
      const femaleCount = singers.filter(s => s.profile.sex === 'F').length;
      for (const singer of singers) {
        singer.state = CrewState.SINGING;
        singer.stateTimer = duration;
        singer.shantyInitiatorId = member.id;
        singer.thoughtBubble = 'music_note';
        singer.thoughtBubbleTimer = duration;
        singer.conversationCooldown = 30;
        singer.path = [];
      }
      if (audio) audio.playShanty({ male: maleCount, female: femaleCount }, member.deck);
      log('started a sea shanty');
      return true;
    }
    case 'Dance': {
      const DANCE_MAX = 5;
      const DANCE_CMD_DURATION = 15;
      const dancers: Actor[] = [member];
      for (const c of crew) {
        if (dancers.length >= DANCE_MAX) break;
        if (c.id === member.id || c.actorType !== 'human' || c.deck !== member.deck) continue;
        if (c.state === CrewState.IDLE || (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE)) {
          dancers.push(c);
        }
      }
      if (dancers.length < 2) { fail('not enough crew nearby to dance'); return true; }
      for (const dancer of dancers) {
        dancer.state = CrewState.DANCING;
        dancer.stateTimer = DANCE_CMD_DURATION;
        dancer.shantyInitiatorId = member.id;
        dancer.thoughtBubble = 'music_note';
        dancer.thoughtBubbleTimer = DANCE_CMD_DURATION;
        dancer.conversationCooldown = 30;
        dancer.path = [];
      }
      log('started dancing');
      return true;
    }
    case 'Stop': {
      // Free conversation partner
      if (member.state === CrewState.TALKING) {
        stopConversation(member, crew);
      }
      // Clear shanty/dance group
      if (member.state === CrewState.SINGING || member.state === CrewState.DANCING) {
        member.shantyInitiatorId = null;
      }
      // Free copulation/interaction partner
      if (member.copulationTarget?.type === 'crew') {
        const partner = crew.find(c => c.id === (member.copulationTarget as { type: 'crew'; actorId: number }).actorId);
        if (partner) {
          partner.state = CrewState.IDLE;
          partner.idleTimer = 1 + Math.random() * 2;
          partner.copulationTarget = null;
        }
      }
      member.copulationTarget = null;
      member.state = CrewState.IDLE;
      member.path = [];
      member.idleTimer = 1 + Math.random() * 2;
      log('stopped');
      return true;
    }
    case 'Order': {
      const target = crew.find(c => c.id === cmd.actorId);
      if (!target) { fail(`actor ${cmd.actorId} not found`); return true; }
      // Compliance check based on friendship
      const rel = target.relations.find(r => r.actorId === member.id);
      const friendship = rel?.friendship ?? 128;
      if (friendship < 64 && Math.random() > 0.3) {
        log(`ordered ${target.profile.name} to ${cmd.order.name} but they refused`);
        return true;
      }
      target.commandQueue.length = 0; // clear their queue
      target.commandQueue.push(cmd.order);
      log(`ordered ${target.profile.name} to ${cmd.order.name}`);
      return true;
    }
    case 'Tell': {
      const target = crew.find(c => c.id === cmd.actorId);
      if (!target) { fail(`actor ${cmd.actorId} not found`); return true; }
      log(`told ${target.profile.name}: "${cmd.text ?? '...'}"`);
      // For now Tell is just cosmetic — shows speech bubble
      member.speechBubbleText = cmd.text ?? '...';
      member.speechBubbleTimer = 3;
      return true;
    }
    default:
      fail(`unknown command "${(cmd as { name: string }).name}"`);
      return true;
  }
}

// Issue a command from the UI — interrupts current activity and executes immediately
export function issueCommand(actor: Actor, command: Command, allActors: Actor[]): void {
  // Clean up current activity
  if (actor.state === CrewState.TALKING) {
    stopConversation(actor, allActors);
  }
  if (actor.copulationTarget?.type === 'crew') {
    const partnerId = (actor.copulationTarget as { type: 'crew'; actorId: number }).actorId;
    const partner = allActors.find(c => c.id === partnerId);
    if (partner) {
      partner.state = CrewState.IDLE;
      partner.idleTimer = 1 + Math.random() * 2;
      partner.copulationTarget = null;
    }
  }
  actor.copulationTarget = null;
  actor.commandQueue.length = 0;
  actor.commandQueue.push(command);
  actor.state = CrewState.IDLE;
  actor.path = [];
  actor.idleTimer = 0; // execute on next tick
}
