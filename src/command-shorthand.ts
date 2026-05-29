import type { Command } from './types';

/**
 * Spec for shorthand command parsing.
 * Suffix conventions:
 *   (none) = required int, ? = optional int, $ = required string token,
 *   ... = rest of line as string, () = recursive command in parens
 */
export const COMMANDS: Record<string, string[]> = {
  Sleep:             ['deck?', 'x?', 'y?'],
  Eat:               ['deck?', 'x?', 'y?'],
  Steer:             ['deck?', 'x?', 'y?'],
  Navigate:          ['deck?', 'x?', 'y?'],
  ManCannon:         ['deck?', 'x?', 'y?'],
  Lookout:           ['deck?', 'x?', 'y?'],
  Fish:              ['deck?', 'x?', 'y?'],
  GoTo:              ['deck?', 'x', 'y'],
  GoToDeck:          ['deck'],
  CopulateBarrel:    ['deck', 'x', 'y'],
  LightLantern:      ['deck', 'x', 'y'],
  ExtinguishLantern: ['deck', 'x', 'y'],
  Kiss:              ['actorId'],
  Copulate:          ['actorId'],
  Pet:               ['actorId'],
  Converse:          ['actorId'],
  TakeItem:          ['barrelKey$', 'itemName...'],
  Drink:             ['itemName...'],
  Sing:              [],
  Dance:             [],
  GroupDance:         [],
  BuryAtSea:         ['corpseActorId'],
  SetHealth:         ['amount'],
  Stop:              [],
  Tell:              ['actorId', 'text...'],
  Order:             ['actorId', 'order()'],
};

// Case-insensitive lookup: lowercase → canonical name
const LOOKUP = new Map<string, string>();
for (const name of Object.keys(COMMANDS)) {
  LOOKUP.set(name.toLowerCase(), name);
}

function skipWhitespace(input: string, pos: number): number {
  while (pos < input.length && input[pos] === ' ') pos++;
  return pos;
}

function readWord(input: string, pos: number): [string, number] {
  const start = pos;
  while (pos < input.length && input[pos] !== ' ' && input[pos] !== ')') pos++;
  return [input.slice(start, pos), pos];
}

function isDigitOrMinus(ch: string): boolean {
  return (ch >= '0' && ch <= '9') || ch === '-';
}

function peekIsNumber(input: string, pos: number): boolean {
  pos = skipWhitespace(input, pos);
  if (pos >= input.length) return false;
  return isDigitOrMinus(input[pos]);
}

function readInt(input: string, pos: number): [number, number] {
  pos = skipWhitespace(input, pos);
  const [word, next] = readWord(input, pos);
  const n = parseInt(word, 10);
  if (isNaN(n)) throw new Error(`Expected integer at position ${pos}, got "${word}"`);
  return [n, next];
}

function readStringToken(input: string, pos: number): [string, number] {
  pos = skipWhitespace(input, pos);
  return readWord(input, pos);
}

/** Read rest of line, but stop before an unmatched ')' */
function readRest(input: string, pos: number): [string, number] {
  pos = skipWhitespace(input, pos);
  const start = pos;
  let depth = 0;
  while (pos < input.length) {
    const ch = input[pos];
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) break; // unmatched — stop here
      depth--;
    }
    pos++;
  }
  const text = input.slice(start, pos).trimEnd();
  return [text, pos];
}

function parseCommandAt(input: string, pos: number): [Command, number] {
  pos = skipWhitespace(input, pos);

  // Read command name
  const [rawName, afterName] = readWord(input, pos);
  if (!rawName) throw new Error('Empty command');

  const canonical = LOOKUP.get(rawName.toLowerCase());
  if (!canonical) throw new Error(`Unknown command: "${rawName}"`);

  const spec = COMMANDS[canonical];
  const cmd: any = { name: canonical };
  pos = afterName;

  for (const argSpec of spec) {
    if (argSpec.endsWith('()')) {
      // Recursive command in parens
      const fieldName = argSpec.slice(0, -2);
      pos = skipWhitespace(input, pos);
      if (pos >= input.length || input[pos] !== '(') {
        throw new Error(`Expected '(' for nested command "${fieldName}" at position ${pos}`);
      }
      pos++; // consume '('
      const [nested, afterNested] = parseCommandAt(input, pos);
      pos = skipWhitespace(input, afterNested);
      if (pos >= input.length || input[pos] !== ')') {
        throw new Error(`Expected ')' after nested command at position ${pos}`);
      }
      pos++; // consume ')'
      cmd[fieldName] = nested;
    } else if (argSpec.endsWith('...')) {
      // Rest of line as string
      const fieldName = argSpec.slice(0, -3);
      const [text, afterText] = readRest(input, pos);
      pos = afterText;
      if (text) cmd[fieldName] = text;
    } else if (argSpec.endsWith('$')) {
      // Required string token
      const fieldName = argSpec.slice(0, -1);
      const [token, afterToken] = readStringToken(input, pos);
      if (!token) throw new Error(`Missing required string argument "${fieldName}"`);
      pos = afterToken;
      cmd[fieldName] = token;
    } else if (argSpec.endsWith('?')) {
      // Optional int
      const fieldName = argSpec.slice(0, -1);
      if (peekIsNumber(input, pos)) {
        const [n, afterN] = readInt(input, pos);
        pos = afterN;
        cmd[fieldName] = n;
      }
    } else {
      // Required int
      const fieldName = argSpec;
      const [n, afterN] = readInt(input, pos);
      pos = afterN;
      cmd[fieldName] = n;
    }
  }

  return [cmd, pos];
}

export function parseShorthand(input: string): Command {
  const [cmd] = parseCommandAt(input.trim(), 0);
  return cmd;
}

export function parseShorthandLines(text: string): Command[] {
  const commands: Command[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    commands.push(parseShorthand(trimmed));
  }
  return commands;
}
