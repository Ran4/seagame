#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'sprites');

// Load .env
try {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('OPENAI_API_KEY not found');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const TILE_STYLE = 'Pixel art game tile, exactly 32x32 pixel grid scaled up to fill the image. SNES 16-bit retro style like Harvest Moon. Top-down bird\'s-eye view. Each pixel is a clearly visible square block. No anti-aliasing, no smoothing, no gradients. Vibrant but warm color palette.';

const CREW_STYLE = 'Pixel art game character sprite, exactly 32x32 pixel grid scaled up. SNES 16-bit retro style like Harvest Moon. Top-down bird\'s-eye view looking straight down at the character. Each pixel is a clearly visible square block. No anti-aliasing. Transparent background.';

const ITEM_STYLE = 'Pixel art inventory icon, exactly 32x32 pixel grid scaled up. SNES 16-bit retro style like Harvest Moon. Centered on transparent background. Each pixel is a clearly visible square block. No anti-aliasing, no smoothing.';

const BUBBLE_STYLE = 'Pixel art thought bubble icon, exactly 32x32 pixel grid scaled up. SNES 16-bit retro style like Harvest Moon. Transparent background. Each pixel is a clearly visible square block. No anti-aliasing, no smoothing. A small white round thought bubble with a symbol inside it and two small circles trailing below-left as the bubble tail.';

const SPRITES = [
  // Tiles
  ['water', `${TILE_STYLE} Deep ocean water tile. Dark navy blue with subtle teal-colored wave ripple pattern. Seamless tileable. No border, no outline, no frame - the art must go edge to edge filling the entire image.`],
  ['water2', `${TILE_STYLE} Deep ocean water tile, alternate frame. Dark navy blue with teal wave ripples in a slightly shifted position compared to the first frame. Seamless tileable.`],
  ['hull', `${TILE_STYLE} Wooden pirate ship hull wall seen from above. Dark brown weathered oak planks with visible wood grain and nail heads. Thick sturdy timber.`],
  ['floor', `${TILE_STYLE} Wooden ship deck floor planks. Warm golden-tan horizontal wood planks with thin dark gaps between them. Well-worn but maintained.`],
  ['stairs', `${TILE_STYLE} Wooden staircase going down to a lower deck, seen from directly above. Visible wooden steps descending, with simple side rails. Dark opening below.`],
  ['helm', `${TILE_STYLE} Ship's steering wheel (helm) mounted on the deck, seen from directly above. Dark wood and brass wheel with 8 spokes, mounted on a wooden pedestal.`],
  ['mast', `${TILE_STYLE} Thick round wooden ship mast, cross-section seen from directly above. Large brown circle of wood with rope rigging coiled around the base. Surrounded by deck planks.`],
  ['cannon', `${TILE_STYLE} Black iron cannon on a small wooden wheeled carriage, seen from directly above. The barrel points upward (toward the bow). Dark metal with wooden mount.`],
  ['stove', `${TILE_STYLE} Small brick and cast-iron cooking stove in a ship's galley kitchen, seen from above. Warm orange-red fire glow from the cooking surface. Dark iron body with brick base.`],
  ['bed', `${TILE_STYLE} Simple wooden-frame sailor's bed/bunk, seen from above. Blue-striped blanket or sheet with a small white pillow at one end. Compact shipboard sleeping berth.`],
  ['barrel', `${TILE_STYLE} Round wooden storage barrel seen from directly above. The circular top has visible wood grain in a radial pattern with two dark iron bands/hoops crossing it.`],
  ['table', `${TILE_STYLE} Rectangular wooden dining table, seen from directly above. Dark brown sturdy wood surface with visible grain. Simple ship's mess table.`],
  ['lantern', `${TILE_STYLE} A brass ship's lantern on the deck, seen from directly above. Round brass base with a glass dome on top containing a warm yellow flame. Golden metallic color with warm light glow.`],

  // Crew
  ['crew_red', `${CREW_STYLE} Small pirate character seen from directly above. Red bandana on head, red vest over white shirt. Visible round head, shoulders, and feet. Idle standing pose facing downward.`],
  ['crew_blue', `${CREW_STYLE} Small pirate character seen from directly above. Blue tricorn hat, blue naval coat. Visible round head from above, shoulders, and feet. Idle standing pose facing downward.`],
  ['crew_green', `${CREW_STYLE} Small pirate character seen from directly above. Green headband, green vest over dark shirt. Visible round head, shoulders, and feet. Idle standing pose facing downward.`],
  ['crew_yellow', `${CREW_STYLE} Small pirate character seen from directly above. Yellow/gold captain's hat, gold-trimmed dark coat. Visible round head, shoulders, and feet. Idle standing pose facing downward.`],

  // Items
  ['item_cutlass', `${ITEM_STYLE} A pirate's cutlass — short curved steel sword with a brass hand guard and dark wooden grip. Diagonal orientation, blade pointing upper-right.`],
  ['item_semen', `${ITEM_STYLE} A small milky-white opaque splotch or splatter. Goopy viscous blob shape, slightly irregular edges. Off-white and pearlescent.`],

  // Thought bubbles
  ['bubble_heart', `${BUBBLE_STYLE} Inside the bubble is a bright red pixel-art heart symbol. The heart is solid red, classic valentine shape.`],
  ['bubble_broken_heart', `${BUBBLE_STYLE} Inside the bubble is a broken heart symbol — a red heart cracked/split down the middle with a jagged lightning-bolt crack, pieces slightly separated. Dark crack line through the center.`],
];

async function generate(name, prompt) {
  const outPath = path.join(OUT_DIR, `${name}.png`);
  if (fs.existsSync(outPath)) {
    console.log(`  - ${name}.png (exists, skipping)`);
    return true;
  }

  console.log(`  Generating ${name}...`);

  const body = {
    model: 'gpt-image-1.5',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
  };

  // Furniture and crew need transparent backgrounds (drawn on top of floor)
  const opaqueSprites = new Set(['water', 'water2', 'hull', 'floor']);
  if (!opaqueSprites.has(name)) {
    body.background = 'transparent';
  }

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`  ✗ ${name}: ${res.status} ${err.slice(0, 200)}`);
      return false;
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;

    if (b64) {
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      console.log(`  ✓ ${name}.png`);
      return true;
    }

    const url = data.data?.[0]?.url;
    if (url) {
      const imgRes = await fetch(url);
      fs.writeFileSync(outPath, Buffer.from(await imgRes.arrayBuffer()));
      console.log(`  ✓ ${name}.png`);
      return true;
    }

    console.error(`  ✗ ${name}: no image in response`);
    return false;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`Generating ${SPRITES.length} sprites into ${OUT_DIR}\n`);

  let ok = 0;
  let fail = 0;

  // Batch 4 at a time
  for (let i = 0; i < SPRITES.length; i += 4) {
    const batch = SPRITES.slice(i, i + 4);
    const results = await Promise.all(batch.map(([name, prompt]) => generate(name, prompt)));
    for (const r of results) r ? ok++ : fail++;
  }

  console.log(`\nDone: ${ok} generated, ${fail} failed`);
}

main();
