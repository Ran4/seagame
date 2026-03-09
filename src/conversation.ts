/**
 * Crew conversation system.
 *
 * Conversations are pre-written dialogues stored in CONVERSATION_SNIPPETS.json.
 * Each dialogue is categorized by a key: "{context}_{partnerMood}".
 *
 * Context (speaker/situation): generic, work, night, hungry, tired
 * Partner mood: friendly, unfriendly, tired, hungry, horny
 *
 * When a conversation starts, a full script is picked and played back line by
 * line, alternating between the two crew members.
 *
 * At the end: +2 friendship (or −3 for unfriendly conversations).
 * Each crew gets a 30–60 s cooldown before the next conversation.
 */

import { CrewMember, CrewState, TILE_SIZE } from './types';

const CONVERSATION_PROXIMITY = 2; // tiles
const CONVERSATION_EXCHANGE_DURATION = 3; // seconds per exchange
const CONVERSATION_COOLDOWN_MIN = 30;
const CONVERSATION_COOLDOWN_MAX = 60;
const CONVERSATION_CHANCE = 0.15;
const CONVERSATION_FRIENDSHIP_GAIN = 2;
const CONVERSATION_FRIENDSHIP_LOSS = 3;

let CONVERSATION_SCRIPTS: Record<string, string[][]> = {};

fetch('/CONVERSATION_SNIPPETS.json')
  .then(r => r.json())
  .then(data => { CONVERSATION_SCRIPTS = data; })
  .catch(err => console.warn('Failed to load conversation snippets:', err));

type ContextTag = 'generic' | 'work' | 'night' | 'hungry' | 'tired';
type MoodTag = 'friendly' | 'unfriendly' | 'tired' | 'hungry' | 'horny' | 'drunken';

function weightedPick<T>(entries: [T, number][]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function pickContext(speaker: CrewMember, brightness: number): ContextTag {
  const w: [ContextTag, number][] = [['generic', 3], ['work', 2]];
  if (speaker.conditions.has('hungry') || speaker.conditions.has('starving')) w.push(['hungry', 3]);
  if (speaker.conditions.has('tired') || speaker.conditions.has('exhausted')) w.push(['tired', 3]);
  if (brightness < 0.5) w.push(['night', 3]);
  return weightedPick(w);
}

function pickPartnerMood(speaker: CrewMember, partner: CrewMember): MoodTag {
  const w: [MoodTag, number][] = [['friendly', 1]]; // base fallback
  const rel = speaker.relations.find(r => r.crewId === partner.id);
  const revRel = partner.relations.find(r => r.crewId === speaker.id);
  if (rel) {
    if (rel.friendship >= 128) w.push(['friendly', 2]);
    if (rel.friendship < 64) w.push(['unfriendly', 3]);
    // Horny: mutual attraction >= 160
    if (rel.attraction >= 160 && revRel && revRel.attraction >= 160) {
      w.push(['horny', 3]);
    }
    // Extra horny weight if partner is lustful
    if (partner.conditions.has('lustful')) {
      w.push(['horny', 4]);
    }
  }
  if (partner.conditions.has('tired') || partner.conditions.has('exhausted')) w.push(['tired', 2]);
  if (partner.conditions.has('hungry') || partner.conditions.has('starving')) w.push(['hungry', 2]);
  if (partner.conditions.has('drunk')) w.push(['drunken', 3]);
  return weightedPick(w);
}

function pickConversationScript(speaker: CrewMember, partner: CrewMember, brightness: number): string[] {
  const context = pickContext(speaker, brightness);
  const mood = pickPartnerMood(speaker, partner);
  const key = `${context}_${mood}`;

  // Try exact key, then fall back to generic_friendly
  let pool = CONVERSATION_SCRIPTS[key];
  if (!pool || pool.length === 0) pool = CONVERSATION_SCRIPTS['generic_friendly'];
  if (!pool || pool.length === 0) return ['Arr...', 'Aye...'];

  return pool[Math.floor(Math.random() * pool.length)];
}

function endConversation(member: CrewMember): void {
  member.state = CrewState.IDLE;
  member.idleTimer = 1 + Math.random() * 2;
  member.conversationPartnerId = null;
  member.speechBubbleText = null;
  member.speechBubbleTimer = 0;
  member.conversationMyTurn = false;
  member.conversationScript = [];
  member.conversationCooldown = CONVERSATION_COOLDOWN_MIN +
    Math.random() * (CONVERSATION_COOLDOWN_MAX - CONVERSATION_COOLDOWN_MIN);
}

/** Start a conversation between two adjacent crew. */
export function beginConversation(member: CrewMember, partner: CrewMember, brightness: number = 1.0): void {
  const script = pickConversationScript(member, partner, brightness);
  const isUnfriendly = pickPartnerMood(member, partner) === 'unfriendly';

  member.state = CrewState.TALKING;
  member.conversationPartnerId = partner.id;
  member.conversationExchangesLeft = script.length;
  member.conversationPositive = !isUnfriendly;
  member.conversationScript = script;
  member.conversationMyTurn = true;
  member.speechBubbleText = null;
  member.speechBubbleTimer = 0;
  member.path = [];

  partner.state = CrewState.TALKING;
  partner.conversationPartnerId = member.id;
  partner.conversationExchangesLeft = script.length;
  partner.conversationPositive = !isUnfriendly;
  partner.conversationScript = script;
  partner.conversationMyTurn = false;
  partner.speechBubbleText = null;
  partner.speechBubbleTimer = 0;
  partner.path = [];
}

/** True if crew member is available for conversation (idle or wandering aimlessly). */
function isAvailableForConversation(c: CrewMember): boolean {
  if (c.conversationCooldown > 0 || c.conversationPartnerId !== null || c.copulationTarget) return false;
  if (c.state === CrewState.IDLE) return true;
  // Wandering = walking with no real destination
  if (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE) return true;
  return false;
}

function findNearbyPartner(member: CrewMember, crew: CrewMember[]): CrewMember | undefined {
  const mx = Math.floor(member.pixelX / TILE_SIZE);
  const my = Math.floor(member.pixelY / TILE_SIZE);

  const nearbyCrew = crew.filter(c =>
    c.id !== member.id &&
    c.deck === member.deck &&
    isAvailableForConversation(c) &&
    Math.abs(Math.floor(c.pixelX / TILE_SIZE) - mx) <= CONVERSATION_PROXIMITY &&
    Math.abs(Math.floor(c.pixelY / TILE_SIZE) - my) <= CONVERSATION_PROXIMITY
  );

  if (nearbyCrew.length === 0) return undefined;
  return nearbyCrew[Math.floor(Math.random() * nearbyCrew.length)];
}

/** Called from updateIdle — try to start a conversation with a nearby idle/wandering crew. */
export function tryStartConversation(member: CrewMember, crew: CrewMember[], brightness: number): boolean {
  if (member.conversationCooldown > 0) return false;

  const partner = findNearbyPartner(member, crew);
  if (!partner || Math.random() >= CONVERSATION_CHANCE) return false;

  beginConversation(member, partner, brightness);
  return true;
}

/** Called from updateWalking for wandering crew — stop and chat if passing someone. */
export function tryStartConversationWhileWalking(member: CrewMember, crew: CrewMember[], brightness: number): boolean {
  if (member.conversationCooldown > 0) return false;
  if (member.targetState !== CrewState.IDLE) return false; // only wandering, not walking to a task

  const partner = findNearbyPartner(member, crew);
  if (!partner || Math.random() >= CONVERSATION_CHANCE) return false;

  beginConversation(member, partner, brightness);
  return true;
}

export function updateTalking(member: CrewMember, crew: CrewMember[], dt: number, brightness: number): void {
  // Tick speech bubble timer
  if (member.speechBubbleTimer > 0) {
    member.speechBubbleTimer -= dt;
  }

  // Partner left? End gracefully
  if (member.conversationPartnerId !== null) {
    const partner = crew.find(c => c.id === member.conversationPartnerId);
    if (!partner || partner.state !== CrewState.TALKING || partner.conversationPartnerId !== member.id) {
      endConversation(member);
      return;
    }
  } else {
    endConversation(member);
    return;
  }

  const partner = crew.find(c => c.id === member.conversationPartnerId)!;

  // Current speech bubble expired
  if (member.speechBubbleText !== null && member.speechBubbleTimer <= 0) {
    member.speechBubbleText = null;
    member.conversationExchangesLeft--;
    partner.conversationExchangesLeft = member.conversationExchangesLeft;

    if (member.conversationExchangesLeft <= 0) {
      // Conversation over — apply friendship
      const myRel = member.relations.find(r => r.crewId === partner.id);
      const theirRel = partner.relations.find(r => r.crewId === member.id);
      if (myRel && theirRel) {
        const delta = member.conversationPositive
          ? CONVERSATION_FRIENDSHIP_GAIN
          : -CONVERSATION_FRIENDSHIP_LOSS;
        myRel.friendship = Math.max(0, Math.min(255, myRel.friendship + delta));
        theirRel.friendship = Math.max(0, Math.min(255, theirRel.friendship + delta));
      }
      endConversation(partner);
      endConversation(member);
      return;
    }

    // Hand off to partner
    partner.conversationMyTurn = true;
    member.conversationMyTurn = false;
  }

  // My turn to speak and no active bubble — get next line from script
  if (member.conversationMyTurn && member.speechBubbleText === null && member.speechBubbleTimer <= 0) {
    const scriptIndex = member.conversationScript.length - member.conversationExchangesLeft;
    member.speechBubbleText = member.conversationScript[scriptIndex] ?? 'Arr...';
    member.speechBubbleTimer = CONVERSATION_EXCHANGE_DURATION;
  }
}

export function stopConversation(member: CrewMember, crew: CrewMember[]): void {
  if (member.conversationPartnerId !== null) {
    const partner = crew.find(c => c.id === member.conversationPartnerId);
    if (partner && partner.state === CrewState.TALKING) {
      endConversation(partner);
      partner.conversationCooldown = 10; // shorter cooldown when interrupted
    }
  }
  member.conversationPartnerId = null;
  member.speechBubbleText = null;
  member.speechBubbleTimer = 0;
  member.conversationMyTurn = false;
}

export function tickConversationCooldown(member: CrewMember, dt: number): void {
  if (member.conversationCooldown > 0) {
    member.conversationCooldown -= dt;
  }
}
