1. Add the type to `ThoughtBubble` union in `types.ts` (e.g. `'skull'`)
2. Add sprite prompt in `generate-sprites.mjs` using `BUBBLE_STYLE` (name: `bubble_<type>`)
3. Add the name to `bubbleNames` array in `sprites.ts`
4. Run `node scripts/generate-sprites.mjs` to generate the PNG
5. Set `member.thoughtBubble = '<type>'` and `member.thoughtBubbleTimer = <seconds>` where needed in `crew.ts`
6. Fallback rendering (no sprite) is handled in `drawCrewMember()` in `renderer.ts` — add a case there if needed
