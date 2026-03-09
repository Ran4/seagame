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

const CONVERSATION_SNIPPETS: Record<string, string[]> = {
  generic: [
    "Fine weather, aye?",
    "Pass the grog...",
    "Heard any shanties?",
    "The sea be calm today",
    "Aye, that she is",
    "Reminds me of Nassau",
    "Could be worse, mate",
    "Arr, indeed",
    "Wind's picking up",
    "What a life, eh?",
  ],
  work: [
    "She's listing to port",
    "Cannons need polishing",
    "Decks could use a scrub",
    "Rigging's holding well",
    "Sails look good",
    "Hull's creaking again",
    "Barnacles everywhere",
    "Anchor chain's rusty",
  ],
  mood_hungry: [
    "Me belly's growlin'...",
    "When's supper?",
    "I'd kill for hardtack",
    "Starving out here",
    "Smells like stew!",
    "Got any biscuits?",
  ],
  mood_tired: [
    "Could use some shut-eye",
    "I'm knackered",
    "Can barely stand",
    "Need me hammock",
    "Yaaawn...",
    "Eyes won't stay open",
  ],
  friendly: [
    "Glad ye're aboard",
    "Ye're a good mate",
    "Cheers, friend",
    "I owe ye a drink",
    "Good to see ye",
    "Best crew I've sailed with",
  ],
  unfriendly: [
    "Keep yer distance",
    "Hmph.",
    "What d'ye want?",
    "Leave me be",
    "Don't push yer luck",
    "Out of me way",
  ],
  night: [
    "Stars are bright tonight",
    "Dark as Davy Jones",
    "Hear that? Wind...",
    "Quiet night at sea",
    "Moon's out tonight",
    "Spooky waters these",
  ],
};

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

export function tryStartConversation(member: CrewMember, crew: CrewMember[], brightness: number): boolean {
  if (member.conversationCooldown > 0) return false;

  const mx = Math.floor(member.pixelX / TILE_SIZE);
  const my = Math.floor(member.pixelY / TILE_SIZE);

  const nearbyCrew = crew.filter(c =>
    c.id !== member.id &&
    c.deck === member.deck &&
    c.state === CrewState.IDLE &&
    c.conversationCooldown <= 0 &&
    c.conversationPartnerId === null &&
    !c.copulationTarget &&
    Math.abs(Math.floor(c.pixelX / TILE_SIZE) - mx) <= CONVERSATION_PROXIMITY &&
    Math.abs(Math.floor(c.pixelY / TILE_SIZE) - my) <= CONVERSATION_PROXIMITY
  );

  if (nearbyCrew.length === 0 || Math.random() >= CONVERSATION_CHANCE) return false;

  const partner = nearbyCrew[Math.floor(Math.random() * nearbyCrew.length)];
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

  // Pull partner in immediately
  partner.state = CrewState.TALKING;
  partner.conversationPartnerId = member.id;
  partner.conversationExchangesLeft = exchanges;
  partner.conversationPositive = positive;
  partner.conversationMyTurn = false;
  partner.speechBubbleText = null;
  partner.speechBubbleTimer = 0;
  partner.path = [];

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
