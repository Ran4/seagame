import { COMMANDS, parseShorthand } from './command-shorthand';
import { issueCommand } from './crew';
import { CANVAS_WIDTH, CANVAS_HEIGHT, World, CommandInput } from './types';
import type { RenderContext } from './render';

export interface AutocompleteMatch {
  commandName: string;
  argHint: string;
}

function formatArgSpec(specs: string[]): string {
  if (specs.length === 0) return '';
  const parts: string[] = [];
  let optGroup: string[] = [];

  const flushOpt = () => {
    if (optGroup.length > 0) {
      parts.push('[' + optGroup.join(' ') + ']');
      optGroup = [];
    }
  };

  for (const spec of specs) {
    if (spec.endsWith('?')) {
      optGroup.push(spec.slice(0, -1));
    } else {
      flushOpt();
      if (spec.endsWith('...')) parts.push(spec.slice(0, -3));
      else if (spec.endsWith('$')) parts.push(spec.slice(0, -1));
      else if (spec.endsWith('()')) parts.push('(' + spec.slice(0, -2) + ')');
      else parts.push(spec);
    }
  }
  flushOpt();
  return parts.length > 0 ? ' ' + parts.join(' ') : '';
}

export function getAutocomplete(text: string): AutocompleteMatch | null {
  if (!text) return null;
  // Only autocomplete the command name (first word)
  const firstSpace = text.indexOf(' ');
  const typedName = firstSpace >= 0 ? text.slice(0, firstSpace) : text;
  const lower = typedName.toLowerCase();

  for (const name of Object.keys(COMMANDS)) {
    if (name.toLowerCase().startsWith(lower)) {
      return {
        commandName: name,
        argHint: formatArgSpec(COMMANDS[name]),
      };
    }
  }
  return null;
}

export function submitCommandInput(world: World): void {
  if (!world.commandInput) return;
  const text = world.commandInput.text.trim();
  if (!text) {
    world.commandInput = null;
    return;
  }

  const member = world.actors.find(a => a.id === world.selectedActorId);
  if (!member) {
    world.activityLog.push({ text: 'No crew member selected', time: world.time });
    world.commandInput = null;
    return;
  }

  try {
    const command = parseShorthand(text);
    issueCommand(member, command, world.actors);
    world.activityLog.push({
      text: `${member.profile.name}: ${text}`,
      time: world.time,
    });
  } catch (e: any) {
    world.activityLog.push({
      text: `Command error: ${e.message}`,
      time: world.time,
    });
  }

  world.commandInput = null;
}

export function drawCommandInput(rc: RenderContext, commandInput: CommandInput): void {
  const ctx = rc.ctx;
  const barW = 400;
  const barH = 28;
  const barX = (CANVAS_WIDTH - barW) / 2;
  const barY = CANVAS_HEIGHT - barH - 12;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

  // ">" prompt
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textY = barY + barH / 2;
  ctx.fillStyle = '#888';
  ctx.fillText('>', barX + 6, textY);

  const textX = barX + 20;
  const text = commandInput.text;

  const match = getAutocomplete(text);

  if (match && text.length > 0) {
    const firstSpace = text.indexOf(' ');
    const hasFinishedName = firstSpace >= 0;

    // Typed portion (white)
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, textX, textY);
    const typedWidth = ctx.measureText(text).width;

    if (!hasFinishedName) {
      // Still typing command name — show rest in grey
      const remaining = match.commandName.slice(text.length);
      ctx.fillStyle = '#666666';
      ctx.fillText(remaining, textX + typedWidth, textY);
      const fullNameWidth = ctx.measureText(match.commandName).width;

      // Arg hint in green
      if (match.argHint) {
        ctx.fillStyle = '#88cc88';
        ctx.fillText(match.argHint, textX + fullNameWidth, textY);
      }
    } else {
      // Already past command name — show remaining arg hint
      if (match.argHint) {
        ctx.fillStyle = '#556655';
        ctx.fillText(match.argHint, textX + typedWidth, textY);
      }
    }
  } else {
    // No match or empty — just show typed text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, textX, textY);
  }

  // Blinking cursor at cursorPos
  const cursorVisible = Math.floor(Date.now() / 500) % 2 === 0;
  if (cursorVisible) {
    ctx.font = '13px monospace';
    const beforeCursor = text.slice(0, commandInput.cursorPos);
    const cursorX = textX + ctx.measureText(beforeCursor).width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cursorX + 1, barY + 6, 1.5, barH - 12);
  }

  // Tab hint
  if (match && text.length > 0 && text.indexOf(' ') < 0) {
    ctx.fillStyle = '#555555';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('TAB', barX + barW - 8, textY);
  }

  ctx.textBaseline = 'alphabetic';
}
