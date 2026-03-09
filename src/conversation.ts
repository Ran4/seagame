/**
 * Crew conversation system.
 *
 * Idle or wandering crew within 2 tiles on the same deck can autonomously
 * start talking (15% chance per idle decision or per walking step).
 * Conversations can also be player-ordered via Interact > Converse.
 * Snippets are loaded from /CONVERSATION_SNIPPETS.json at startup.
 *
 * A conversation consists of 3–5 exchanges (~3 s each). Crew alternate turns
 * showing a canvas-drawn speech bubble with a short pirate-themed snippet.
 * Snippet category (generic, work, hungry, tired, friendly, unfriendly, night)
 * is chosen by weighted random based on the speaker's state and context.
 *
 * At the end: +2 friendship to both participants, or −3 for "disagreement"
 * conversations (15% chance). Each crew gets a 30–60 s cooldown before they
 * can start another autonomous conversation.
 */

import { CrewMember, CrewState, TILE_SIZE } from './types';

const CONVERSATION_PROXIMITY = 2; // tiles
const CONVERSATION_EXCHANGE_DURATION = 3; // seconds per exchange
const CONVERSATION_MIN_EXCHANGES = 3;
const CONVERSATION_MAX_EXCHANGES = 5;
const CONVERSATION_COOLDOWN_MIN = 30;
const CONVERSATION_COOLDOWN_MAX = 60;
const CONVERSATION_CHANCE = 0.15;
const CONVERSATION_DISAGREE_CHANCE = 0.15;
const CONVERSATION_FRIENDSHIP_GAIN = 2;
const CONVERSATION_FRIENDSHIP_LOSS = 3;

let CONVERSATION_SNIPPETS: Record<string, string[]> = {};

fetch('/CONVERSATION_SNIPPETS.json')
  .then(r => r.json())
  .then(data => { CONVERSATION_SNIPPETS = data; })
  .catch(err => console.warn('Failed to load conversation snippets:', err));

function pickConversationSnippet(speaker: CrewMember, partner: CrewMember, brightness: number): string {
  const weights: [string, number][] = [['generic', 3], ['work', 2]];

  if (speaker.profile.hunger < 80) weights.push(['mood_hungry', 3]);
  if (speaker.profile.energy < 80) weights.push(['mood_tired', 3]);

  const relation = speaker.relations.find(r => r.crewId === partner.id);
  if (relation) {
    if (relation.friendship >= 128) weights.push(['friendly', 2]);
    if (relation.friendship < 64) weights.push(['unfriendly', 3]);
  }

  if (brightness < 0.5) weights.push(['night', 2]);

  const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  let category = 'generic';
  for (const [cat, w] of weights) {
    roll -= w;
    if (roll <= 0) { category = cat; break; }
  }

  const snippets = CONVERSATION_SNIPPETS[category];
  if (!snippets || snippets.length === 0) return 'Arr...';
  return snippets[Math.floor(Math.random() * snippets.length)];
}

function endConversation(member: CrewMember): void {
  member.state = CrewState.IDLE;
  member.idleTimer = 1 + Math.random() * 2;
  member.conversationPartnerId = null;
  member.speechBubbleText = null;
  member.speechBubbleTimer = 0;
  member.conversationMyTurn = false;
  member.conversationCooldown = CONVERSATION_COOLDOWN_MIN +
    Math.random() * (CONVERSATION_COOLDOWN_MAX - CONVERSATION_COOLDOWN_MIN);
}

/** Start a conversation between two adjacent crew (called when initiator arrives or from idle trigger). */
export function beginConversation(member: CrewMember, partner: CrewMember): void {
  const exchanges = CONVERSATION_MIN_EXCHANGES +
    Math.floor(Math.random() * (CONVERSATION_MAX_EXCHANGES - CONVERSATION_MIN_EXCHANGES + 1));
  const positive = Math.random() >= CONVERSATION_DISAGREE_CHANCE;

  member.state = CrewState.TALKING;
  member.conversationPartnerId = partner.id;
  member.conversationExchangesLeft = exchanges;
  member.conversationPositive = positive;
  member.conversationMyTurn = true;
  member.speechBubbleText = null;
  member.speechBubbleTimer = 0;
  member.path = [];

  partner.state = CrewState.TALKING;
  partner.conversationPartnerId = member.id;
  partner.conversationExchangesLeft = exchanges;
  partner.conversationPositive = positive;
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

  beginConversation(member, partner);
  return true;
}

/** Called from updateWalking for wandering crew — stop and chat if passing someone. */
export function tryStartConversationWhileWalking(member: CrewMember, crew: CrewMember[]): boolean {
  if (member.conversationCooldown > 0) return false;
  if (member.targetState !== CrewState.IDLE) return false; // only wandering, not walking to a task

  const partner = findNearbyPartner(member, crew);
  if (!partner || Math.random() >= CONVERSATION_CHANCE) return false;

  beginConversation(member, partner);
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

  // My turn to speak and no active bubble — start speaking
  if (member.conversationMyTurn && member.speechBubbleText === null && member.speechBubbleTimer <= 0) {
    member.speechBubbleText = pickConversationSnippet(member, partner, brightness);
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
