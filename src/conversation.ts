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
 * At the end: 85% success (+2), 12% fail (−4), 3% extreme fail (−50).
 * Each crew gets a 30–60 s cooldown before the next conversation.
 */

import { Actor, ActorType, CrewState, TILE_SIZE } from './types';

const CONVERSATION_PROXIMITY = 1.5; // tiles
const CONVERSATION_EXCHANGE_DURATION = 3; // seconds per exchange
const CONVERSATION_COOLDOWN_MIN = 30;
const CONVERSATION_COOLDOWN_MAX = 60;
const CONVERSATION_CHANCE = 0.15;
const CONVERSATION_FRIENDSHIP_GAIN = 2;
const CONVERSATION_FRIENDSHIP_LOSS = 4;
const CONVERSATION_FRIENDSHIP_CATASTROPHE = 50;

// Animal conversation lines — used when at least one participant is an animal
const ANIMAL_LINES: Record<string, string[]> = {
  dog: ['Woof!', 'Woof woof!', 'Woof...?', '*panting*', '*tail wagging*', 'Bark!', 'Arf!', '*sniff sniff*', 'Ruff!'],
  parrot: ['BRAWWK!', 'Pieces of eight!', 'Polly wants a cracker!', 'Dead men tell no tales!', 'Land ho!', 'Walk the plank!', 'Shiver me timbers!', 'SQUAWK!', 'Pretty bird!'],
  monkey: ['Ooh ooh!', 'Eee eee!', '*chattering*', '*screech*', '*picking fleas*', 'Ooh ah ah!', '*jumps excitedly*', '*scratches head*'],
  cat: ['Meow!', 'Mew?', '*purring*', '*hisses*', '*rubs against leg*', 'Mrrrow!', '*stretches lazily*', '*licks paw*', 'Prrrr...'],
};

let CONVERSATION_SCRIPTS: Record<string, string[][]> = {};

fetch('/CONVERSATION_SNIPPETS.json')
  .then(r => r.json())
  .then(data => { CONVERSATION_SCRIPTS = data; })
  .catch(err => console.warn('Failed to load conversation snippets:', err));

type ContextTag = 'generic' | 'work' | 'night' | 'hungry' | 'tired' | 'grumbling';
type MoodTag = 'friendly' | 'unfriendly' | 'tired' | 'hungry' | 'horny' | 'drunken' | 'grumbling' | 'mutinous';

function weightedPick<T>(entries: [T, number][]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function pickContext(speaker: Actor, brightness: number): ContextTag {
  const w: [ContextTag, number][] = [['generic', 3], ['work', 2]];
  if (speaker.conditions.has('hungry') || speaker.conditions.has('starving')) w.push(['hungry', 3]);
  if (speaker.conditions.has('tired') || speaker.conditions.has('exhausted')) w.push(['tired', 3]);
  if (brightness < 0.5) w.push(['night', 3]);
  if (speaker.conditions.has('grumbling') || speaker.conditions.has('miserable') || speaker.conditions.has('mutinous')) w.push(['grumbling', 4]);
  return weightedPick(w);
}

function pickPartnerMood(speaker: Actor, partner: Actor): MoodTag {
  const w: [MoodTag, number][] = [['friendly', 1]]; // base fallback
  const rel = speaker.relations.find(r => r.actorId === partner.id);
  const revRel = partner.relations.find(r => r.actorId === speaker.id);
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
  if (partner.conditions.has('grumbling') || partner.conditions.has('miserable')) w.push(['grumbling', 4]);
  if (partner.conditions.has('mutinous')) w.push(['mutinous', 6]);
  return weightedPick(w);
}

function pickAnimalLine(actorType: ActorType): string {
  const lines = ANIMAL_LINES[actorType] ?? ['...'];
  return lines[Math.floor(Math.random() * lines.length)];
}

// NPC conversation scripts by role
const NPC_SCRIPTS: Record<string, string[][]> = {
  bartender: [
    ['What\'ll ye have?', 'Grog, of course!', 'Comin\' right up!'],
    ['Rough seas out there?', 'Aye, always rough.', 'That\'s the life we chose!'],
    ['Heard any news?', 'Merchants say storms to the west.', 'Best stay in harbor a spell.'],
    ['This grog\'s me own recipe!', 'Tastes like... fire.', 'Har! That means it\'s good!'],
    ['Ye look like ye need a drink.', 'Aye, been a long voyage.', 'Then sit ye down, friend!'],
    ['Had a crew come through last week...', 'Oh?', 'Drank the whole cellar dry!'],
    ['Watch out for the navy patrols.', 'Thanks for the tip.', 'They don\'t come in here though!'],
    ['Ever tried me special grog?', 'What\'s in it?', 'Best not to ask, friend!'],
    ['Business is good lately.', 'Lots of ships?', 'Aye, pirates and traders both!'],
  ],
  innkeeper: [
    ['Need a room?', 'Just passing through.', 'Well, beds are always ready!'],
    ['Rest your weary bones!', 'Aye, I could use a nap.', 'Best beds on the island!'],
    ['How long will ye be staying?', 'Just till the tide turns.', 'Make yourselves at home!'],
    ['Where ye sailing from?', 'Oh, far away...', 'Ye look like ye\'ve seen some waters!'],
    ['Breakfast is at dawn!', 'We\'ll be up early.', 'Good, good. I make a fine porridge!'],
    ['These sheets are freshly washed!', 'That\'s... rare.', 'Only the best here!'],
    ['Quiet night tonight.', 'Good, we need the rest.', 'The sea will be there tomorrow.'],
    ['Some crew slept three days straight!', 'Can\'t blame them.', 'I had to check they were alive!'],
  ],
  merchant: [
    ['Fine wares for sale!', 'What have ye got?', 'Only the best, friend!'],
    ['Looking for supplies?', 'Always.', 'I\'ve got rope, pitch, and hardtack!'],
    ['Business been good?', 'Can\'t complain!', 'That\'s what I like to hear!'],
    ['Need any gunpowder?', 'How much ye got?', 'Enough to sink a fleet!'],
    ['These here spices came from the Far East!', 'Smells... exotic.', 'Worth their weight in gold!'],
    ['I also buy, ye know.', 'We\'ll keep that in mind.', 'Fair prices, always fair!'],
    ['Got some maps from a wreck.', 'Treasure maps?', 'Could be... for the right price!'],
    ['Fresh fruit just came in!', 'Hard to find at sea.', 'That\'s why the price is fair!'],
    ['I know a shipwright two islands over.', 'Might need that.', 'Tell him Walter sent ye!'],
  ],
  townsfolk: [
    ['Nice day, ain\'t it?', 'Aye, fair weather.', 'Makes ye glad to be on land!'],
    ['Ye just sail in?', 'Aye, from far waters.', 'Welcome to our little harbor!'],
    ['Seen any sea monsters?', 'Not this time.', 'Give it time, heh!'],
    ['My cousin\'s a sailor too.', 'Small world.', 'Lost at sea five years ago...'],
    ['The fish been running good!', 'That\'s good to hear.', 'Best fishing in years!'],
    ['Careful in the tavern...', 'Why\'s that?', 'Greg\'s grog will floor ye!'],
    ['Used to sail meself.', 'What happened?', 'Got tired of the rocking!'],
    ['Heard there\'s treasure east.', 'Really?', 'Just rumors, mind ye!'],
    ['Storm\'s coming, I reckon.', 'How can ye tell?', 'Me bones never lie!'],
    ['We don\'t get many ships here.', 'Quiet harbor.', 'That\'s how we like it!'],
  ],
  blacksmith: [
    ['Need anything forged?', 'Just looking.', 'I can fix anything metal!'],
    ['This blade needs sharpening!', 'Hand it over.', 'Good as new, see?'],
    ['Finest steel this side of the sea!', 'Impressive.', 'Forged it meself!'],
    ['Ye should see me cannonballs.', 'Oh aye?', 'Perfectly round, every one!'],
    ['Hot work, this.', 'Looks it!', 'But someone\'s got to do it!'],
    ['That cutlass has seen better days.', 'Can ye fix it?', 'Good as new by morning!'],
    ['I forge anchors too!', 'We might need one.', 'Strongest in the harbor!'],
    ['The navy pays well for my work.', 'You work for the navy?', 'I work for anyone with coin!'],
  ],
};

function pickConversationScript(speaker: Actor, partner: Actor, brightness: number): { script: string[], mood: MoodTag } {
  // NPC conversations use role-specific scripts
  const speakerNPC = speaker.statuses.get('npc') as { role: string } | null;
  const partnerNPC = partner.statuses.get('npc') as { role: string } | null;
  const npcRole = speakerNPC?.role ?? partnerNPC?.role;
  if (npcRole && NPC_SCRIPTS[npcRole]) {
    const scripts = NPC_SCRIPTS[npcRole];
    // Scripts are written NPC-first; beginConversation gives the NPC the first
    // turn when a crew member initiates, so the script is used as-is.
    const script = scripts[Math.floor(Math.random() * scripts.length)];
    return { script, mood: 'friendly' };
  }

  const eitherAnimal = speaker.actorType !== 'human' || partner.actorType !== 'human';

  if (eitherAnimal) {
    // Animal conversations are shorter (2-3 exchanges)
    const length = 2 + Math.floor(Math.random() * 2);
    const script: string[] = [];
    for (let i = 0; i < length; i++) {
      const who = i % 2 === 0 ? speaker : partner;
      if (who.actorType === 'human') {
        // Human responding to animal — use simple phrases
        const humanToAnimal = ['Hey there!', 'Good boy!', 'Good girl!', 'Who\'s a good one?', 'Heh...', 'Easy there...', 'Arr, hello!', 'Come here!'];
        script.push(humanToAnimal[Math.floor(Math.random() * humanToAnimal.length)]);
      } else {
        script.push(pickAnimalLine(who.actorType));
      }
    }
    return { script, mood: 'friendly' };
  }

  const context = pickContext(speaker, brightness);
  const mood = pickPartnerMood(speaker, partner);
  const key = `${context}_${mood}`;

  // Try exact key, then fall back to generic_friendly
  let pool = CONVERSATION_SCRIPTS[key];
  if (!pool || pool.length === 0) pool = CONVERSATION_SCRIPTS['generic_friendly'];
  if (!pool || pool.length === 0) return { script: ['Arr...', 'Aye...'], mood };

  return { script: pool[Math.floor(Math.random() * pool.length)], mood };
}

function endConversation(member: Actor): void {
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
export function beginConversation(member: Actor, partner: Actor, brightness: number = 1.0): void {
  const { script, mood } = pickConversationScript(member, partner, brightness);
  const isUnfriendly = mood === 'unfriendly';

  // NPC scripts are written NPC-first — when a crew member walks up to an NPC,
  // the NPC gets the first turn so the question comes before the answer.
  const npcSpeaksFirst = partner.statuses.has('npc') && !member.statuses.has('npc');

  member.state = CrewState.TALKING;
  member.conversationPartnerId = partner.id;
  member.conversationExchangesLeft = script.length;
  member.conversationPositive = !isUnfriendly;
  member.conversationScript = script;
  member.conversationMyTurn = !npcSpeaksFirst;
  member.speechBubbleText = null;
  member.speechBubbleTimer = 0;
  member.path = [];

  partner.state = CrewState.TALKING;
  partner.conversationPartnerId = member.id;
  partner.conversationExchangesLeft = script.length;
  partner.conversationPositive = !isUnfriendly;
  partner.conversationScript = script;
  partner.conversationMyTurn = npcSpeaksFirst;
  partner.speechBubbleText = null;
  partner.speechBubbleTimer = 0;
  partner.path = [];
}

/** True if crew member is available for conversation (idle or wandering aimlessly). */
function isAvailableForConversation(c: Actor): boolean {
  if (c.conversationCooldown > 0 || c.conversationPartnerId !== null || c.copulationTarget) return false;
  if (c.state === CrewState.IDLE) return true;
  // Wandering = walking with no real destination
  if (c.state === CrewState.WALKING && c.targetState === CrewState.IDLE) return true;
  return false;
}

function findNearbyPartner(member: Actor, crew: Actor[]): Actor | undefined {
  const maxDist = CONVERSATION_PROXIMITY * TILE_SIZE;
  const maxDistSq = maxDist * maxDist;

  const nearbyCrew = crew.filter(c => {
    if (c.id === member.id || c.deck !== member.deck || !isAvailableForConversation(c)) return false;
    const dx = c.pixelX - member.pixelX;
    const dy = c.pixelY - member.pixelY;
    return dx * dx + dy * dy <= maxDistSq;
  });

  if (nearbyCrew.length === 0) return undefined;
  return nearbyCrew[Math.floor(Math.random() * nearbyCrew.length)];
}

/** Called from updateIdle — try to start a conversation with a nearby idle/wandering crew. */
export function tryStartConversation(member: Actor, crew: Actor[], brightness: number): boolean {
  if (member.conversationCooldown > 0) return false;

  const partner = findNearbyPartner(member, crew);
  if (!partner || Math.random() >= CONVERSATION_CHANCE) return false;

  beginConversation(member, partner, brightness);
  return true;
}

/** Called from updateWalking for wandering crew — stop and chat if passing someone. */
export function tryStartConversationWhileWalking(member: Actor, crew: Actor[], brightness: number): boolean {
  if (member.conversationCooldown > 0) return false;
  if (member.targetState !== CrewState.IDLE) return false; // only wandering, not walking to a task

  const partner = findNearbyPartner(member, crew);
  if (!partner || Math.random() >= CONVERSATION_CHANCE) return false;

  beginConversation(member, partner, brightness);
  return true;
}

export function updateTalking(member: Actor, crew: Actor[], dt: number, brightness: number): void {
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
      const myRel = member.relations.find(r => r.actorId === partner.id);
      const theirRel = partner.relations.find(r => r.actorId === member.id);
      if (myRel && theirRel) {
        const roll = Math.random();
        // 85% success (+2), 12% fail (-4), 3% extreme fail (-50)
        const delta = roll < 0.85 ? CONVERSATION_FRIENDSHIP_GAIN
          : roll < 0.97 ? -CONVERSATION_FRIENDSHIP_LOSS
          : -CONVERSATION_FRIENDSHIP_CATASTROPHE;
        myRel.friendship = Math.max(0, Math.min(255, myRel.friendship + delta));
        theirRel.friendship = Math.max(0, Math.min(255, theirRel.friendship + delta));
      }
      // After NPC conversation, crew may gossip about what they heard
      const partnerNPC = partner.statuses.get('npc') as { role: string } | null;
      const memberNPC = member.statuses.get('npc') as { role: string } | null;
      const npcRole = partnerNPC?.role ?? memberNPC?.role;
      const crewMember = partnerNPC ? member : memberNPC ? partner : null;
      endConversation(partner);
      endConversation(member);
      // Set the gossip bubble after endConversation — it clears speech bubbles
      // unconditionally and would wipe the line before it ever rendered.
      if (npcRole && crewMember && !crewMember.statuses.has('npc')) {
        // Small morale boost from socializing
        crewMember.profile.morale = Math.min(255, crewMember.profile.morale + 3);
        // 40% chance to gossip about it
        if (Math.random() < 0.4) {
          const gossipLines: Record<string, string[]> = {
            bartender: ['The bartender says storms are coming...', 'Greg makes a mean grog!', 'Bartender knows all the gossip.'],
            innkeeper: ['The innkeeper is so kind!', 'Betty says business is good.', 'Nice beds at the inn!'],
            merchant: ['The merchant has good prices.', 'Walter offered us a deal!', 'Merchant says supply ships are late.'],
            blacksmith: ['Ida forges fine steel!', 'The smithy can fix anything.', 'Blacksmith says cutlass steel is rare.'],
            townsfolk: ['The locals are friendly!', 'Heard some interesting gossip...', 'Nice folk around here.'],
          };
          const lines = gossipLines[npcRole] ?? ['Had an interesting chat!'];
          crewMember.speechBubbleText = lines[Math.floor(Math.random() * lines.length)];
          crewMember.speechBubbleTimer = 4;
        }
      }
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

export function stopConversation(member: Actor, crew: Actor[]): void {
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
  member.conversationScript = [];
  member.conversationExchangesLeft = 0;
}

export function tickConversationCooldown(member: Actor, dt: number): void {
  if (member.conversationCooldown > 0) {
    member.conversationCooldown -= dt;
  }
}
