#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_ROOT = path.join(__dirname, '..', 'public', 'sprites');

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

const SUBDIRS = ['tiles', 'actors', 'items', 'bubbles'];
for (const sub of SUBDIRS) fs.mkdirSync(path.join(SPRITES_ROOT, sub), { recursive: true });

// Downscale generated sprites to this size. Set to 0 to save at original 1024x1024.
const SPRITE_SIZE = 64;
const SPRITE_SIZE_STR = `${SPRITE_SIZE || 1024}x${SPRITE_SIZE || 1024}`;

async function resizeBuffer(buf) {
  if (!SPRITE_SIZE) return buf;
  return sharp(buf)
    .resize(SPRITE_SIZE, SPRITE_SIZE, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

const BASE_STYLE = `Pixel art, exactly ${SPRITE_SIZE_STR} pixel grid. SNES 16-bit retro style like Harvest Moon. Each pixel is a clearly visible square block. No anti-aliasing, no smoothing.`;

const TILE_STYLE = `${BASE_STYLE} Scaled up to fill the entire image edge to edge. Game tile. Top-down bird's-eye view. No gradients. Vibrant but warm color palette.`;

const CREW_STYLE = `${BASE_STYLE} Game character sprite. Top-down bird's-eye view looking straight down at the character.`;

const ITEM_STYLE = `${BASE_STYLE} Inventory icon. Centered.`;

const BUBBLE_STYLE = `${BASE_STYLE} Thought bubble icon. A small white round thought bubble with a symbol inside it and two small circles trailing below-left as the bubble tail.`;

// Sprite definitions: [category, name, prompt, opts?]
// category determines subfolder and filename prefix: tiles/ → tiles__name.png, actors/ → actor__name.png
// Directional sprites generate 3 files: __south, __north, __west (east = flipped west at runtime)
const SPRITES = [
  // Tiles
  ['tiles', 'water', `${TILE_STYLE} Deep ocean water tile. Dark navy blue with subtle teal-colored wave ripple pattern. Seamless tileable. No border, no outline, no frame - the art must go edge to edge filling the entire image.`],
  ['tiles', 'water2', `${TILE_STYLE} Deep ocean water tile, alternate frame. Dark navy blue with teal wave ripples in a slightly shifted position compared to the first frame. Seamless tileable.`],
  ['tiles', 'hull', `${TILE_STYLE} Wooden pirate ship hull wall seen from above. Dark brown weathered oak planks with visible wood grain and nail heads. Thick sturdy timber.`],
  ['tiles', 'floor', `${TILE_STYLE} Wooden ship deck floor planks. Warm golden-tan horizontal wood planks with thin dark gaps between them. Well-worn but maintained.`],
  ['tiles', 'stairs', `${TILE_STYLE} Wooden staircase going down to a lower deck, seen from directly above. Visible wooden steps descending, with simple side rails. Dark opening below.`],
  ['tiles', 'helm', `${TILE_STYLE} Ship's steering wheel (helm) mounted on the deck, seen from directly above. Dark wood and brass wheel with 8 spokes, mounted on a wooden pedestal.`],
  ['tiles', 'mast', `${TILE_STYLE} Thick round wooden ship mast, cross-section seen from directly above. Large brown circle of wood with rope rigging coiled around the base. Surrounded by deck planks.`],
  ['tiles', 'cannon', `${TILE_STYLE} Black iron cannon on a small wooden wheeled carriage, seen from directly above. The barrel points upward (toward the bow). Dark metal with wooden mount.`],
  ['tiles', 'stove', `${TILE_STYLE} Small brick and cast-iron cooking stove in a ship's galley kitchen, seen from above. Warm orange-red fire glow from the cooking surface. Dark iron body with brick base.`],
  ['tiles', 'bed', `${TILE_STYLE} Simple wooden-frame sailor's bed/bunk, seen from above. Blue-striped blanket or sheet with a small white pillow at one end. Compact shipboard sleeping berth.`],
  ['tiles', 'barrel', `${TILE_STYLE} Round wooden storage barrel seen from directly above. The circular top has visible wood grain in a radial pattern with two dark iron bands/hoops crossing it.`],
  ['tiles', 'table', `${TILE_STYLE} Rectangular wooden dining table, seen from directly above. Dark brown sturdy wood surface with visible grain. Simple ship's mess table.`],
  ['tiles', 'lantern', `${TILE_STYLE} A brass ship's lantern on the deck, seen from directly above. Round brass base with a glass dome on top containing a warm yellow flame. Golden metallic color with warm light glow.`],
  ['tiles', 'raised_floor', `${TILE_STYLE} Dark wooden ship deck floor planks. Rich dark brown horizontal wood planks with thin dark gaps between them. Darker stained wood compared to a regular deck — like mahogany or dark oak. Well-worn but maintained. Seamless and tileable.`],
  ['tiles', 'nest', `${TILE_STYLE} A bird's nest on a wooden ship deck, seen from directly above. Circular nest made of intertwined twigs, straw, and rope fibers. Warm brown and tan colors. Small cozy hollow in the center lined with soft feathers. Rustic and natural looking.`],
  ['tiles', 'land', `${TILE_STYLE} Lush green grass ground tile seen from directly above. Rich vibrant green grass with subtle variation — some darker and lighter green patches, tiny wildflowers, and small clover. Natural and alive-looking. Seamless tileable. No border, no outline — the art fills edge to edge.`],
  ['tiles', 'wharf', `${TILE_STYLE} Weathered wooden harbor wharf/dock planks seen from directly above. Horizontal grey-brown aged timber boards with visible gaps between planks. Slightly worn and salt-stained wood. Subtle rope and iron bolt details. Seamless tileable.`],
  ['tiles', 'gangplank', `${TILE_STYLE} A wide thick wooden gangplank plank seen from directly above. Worn golden-brown wooden boards running left to right. No railings, no ropes, no decorations — just the bare plank. The plank fills 100% of the tile width (edge to edge) and about 80% of the tile height (centered vertically with narrow transparent strips at top and bottom only).`],

  // Crew
  ['actors', 'crew_red', `${CREW_STYLE} Small pirate character. Red bandana on head, red vest over white shirt. Visible round head, shoulders, and feet. Idle standing pose.`, { directional: true }],
  ['actors', 'crew_blue', `${CREW_STYLE} Small pirate character. Blue tricorn hat, blue naval coat. Visible round head, shoulders, and feet. Idle standing pose.`, { directional: true }],
  ['actors', 'crew_green', `${CREW_STYLE} Small pirate character. Green headband, green vest over dark shirt. Visible round head, shoulders, and feet. Idle standing pose.`, { directional: true }],
  ['actors', 'crew_yellow', `${CREW_STYLE} Small pirate character. Yellow/gold captain's hat, gold-trimmed dark coat. Visible round head, shoulders, and feet. Idle standing pose.`, { directional: true }],

  // Animals
  ['actors', 'animal_dog', `${CREW_STYLE} A Bichon Frise dog, taking up about 3/5 of the image, centered. Bright white fluffy fur with a dark pixel outline. Round fluffy head with two small dark eyes and a tiny black nose. Compact oval body. Four small paws.`, { directional: true }],
  ['actors', 'animal_parrot', `${CREW_STYLE} A colorful tropical parrot on a pirate ship deck. Bright green body feathers, red and blue wing accents, curved yellow beak. Tail feathers trailing behind. Perched standing pose.`, { directional: true }],
  ['actors', 'animal_monkey', `${CREW_STYLE} A small cute capuchin monkey on a pirate ship deck. Light brown fur, dark face, small round head, long curled tail. About half the size of a human character. Mischievous-looking.`, { directional: true }],

  // Items
  ['items', 'cutlass', `${ITEM_STYLE} A pirate's cutlass — short curved steel sword with a brass hand guard and dark wooden grip. Diagonal orientation, blade pointing upper-right.`],
  ['items', 'semen', `${ITEM_STYLE} A small milky-white opaque splotch or splatter. Goopy viscous blob shape, slightly irregular edges. Off-white and pearlescent.`],
  ['items', 'grog_ration', `${ITEM_STYLE} A small wooden tankard or mug filled with dark amber grog rum. Simple round mug shape with a handle on the right side. Dark brown wood, amber liquid visible at top. Slight foam.`],

  // Thought bubbles
  ['bubbles', 'heart', `${BUBBLE_STYLE} Inside the bubble is a bright red pixel-art heart symbol. The heart is solid red, classic valentine shape.`],
  ['bubbles', 'broken_heart', `${BUBBLE_STYLE} Inside the bubble is a broken heart symbol — a red heart cracked/split down the middle with a jagged lightning-bolt crack, pieces slightly separated. Dark crack line through the center.`],
  ['bubbles', 'music_note', `${BUBBLE_STYLE} Inside the bubble is a bright blue musical note symbol — a single eighth note (quaver) with a filled oval notehead and a stem with a flag. Clean pixel-art style.`],
];

/** Replace magenta-ish background pixels with transparent.
 *  Detects the actual background color from the corner pixels, then removes
 *  all pixels within `tolerance` distance of that color. */
async function chromaKey(buf, tolerance = 40) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Sample corner pixel as the background color
  const bgR = data[0], bgG = data[1], bgB = data[2];
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
    if (dr * dr + dg * dg + db * db < tolerance * tolerance * 3) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Map category to filename prefix (singular for actors/items/bubbles)
const CATEGORY_PREFIX = { tiles: 'tiles', actors: 'actor', items: 'item', bubbles: 'bubble' };

async function generate(category, name, prompt) {
  const prefix = CATEGORY_PREFIX[category];
  const filename = `${prefix}__${name}.png`;
  const outPath = path.join(SPRITES_ROOT, category, filename);
  if (fs.existsSync(outPath)) return true;

  console.log(`  Generating ${filename}...`);

  const body = {
    model: 'gpt-image-1.5',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
  };

  // Opaque tiles get no background treatment; everything else uses a magenta
  // chroma-key background that we replace with transparency via sharp afterward.
  const opaqueTiles = new Set(['water', 'water2', 'hull', 'floor', 'land', 'wharf']);
  const useChromaKey = !(category === 'tiles' && opaqueTiles.has(name));

  // Append chroma-key instruction to prompt if needed
  const finalPrompt = useChromaKey
    ? `${prompt} The background must be solid bright magenta (#FF00FF).`
    : prompt;

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, prompt: finalPrompt }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`  ✗ ${filename}: ${res.status} ${err.slice(0, 200)}`);
      return false;
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;

    if (b64) {
      let buf = Buffer.from(b64, 'base64');
      if (useChromaKey) buf = await chromaKey(buf);
      const resized = await resizeBuffer(buf);
      fs.writeFileSync(outPath, resized);
      console.log(`  ✓ ${filename} (${SPRITE_SIZE || 1024}x${SPRITE_SIZE || 1024})`);
      return true;
    }

    const url = data.data?.[0]?.url;
    if (url) {
      const imgRes = await fetch(url);
      let buf = Buffer.from(await imgRes.arrayBuffer());
      if (useChromaKey) buf = await chromaKey(buf);
      const resized = await resizeBuffer(buf);
      fs.writeFileSync(outPath, resized);
      console.log(`  ✓ ${filename} (${SPRITE_SIZE || 1024}x${SPRITE_SIZE || 1024})`);
      return true;
    }

    console.error(`  ✗ ${filename}: no image in response`);
    return false;
  } catch (err) {
    console.error(`  ✗ ${filename}: ${err.message}`);
    return false;
  }
}

const DIRECTION_SUFFIXES = {
  south: { suffix: '__south', promptDir: 'facing south (downward)' },
  north: { suffix: '__north', promptDir: 'facing north (upward), back of head visible' },
  west:  { suffix: '__west', promptDir: 'facing west (left), seen from the side' },
};

function expandSprites() {
  const expanded = [];
  for (const [category, name, prompt, opts] of SPRITES) {
    if (opts?.directional) {
      for (const [, { suffix, promptDir }] of Object.entries(DIRECTION_SUFFIXES)) {
        expanded.push([category, `${name}${suffix}`, `${prompt} The character is ${promptDir}.`]);
      }
    } else {
      expanded.push([category, name, prompt]);
    }
  }
  return expanded;
}

async function main() {
  const allSprites = expandSprites();
  console.log(`Generating ${allSprites.length} sprites into ${SPRITES_ROOT}\n`);

  // First pass: separate existing from new
  const skipped = [];
  const toGenerate = [];
  for (const [category, name, prompt] of allSprites) {
    const prefix = CATEGORY_PREFIX[category];
    const filename = `${prefix}__${name}.png`;
    const outPath = path.join(SPRITES_ROOT, category, filename);
    if (fs.existsSync(outPath)) {
      skipped.push(filename);
    } else {
      toGenerate.push([category, name, prompt]);
    }
  }

  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} already generated: ${skipped.join(', ')}\n`);
  }

  let ok = skipped.length;
  let fail = 0;

  // Batch 4 at a time
  for (let i = 0; i < toGenerate.length; i += 4) {
    const batch = toGenerate.slice(i, i + 4);
    const results = await Promise.all(batch.map(([cat, name, prompt]) => generate(cat, name, prompt)));
    for (const r of results) r ? ok++ : fail++;
  }

  console.log(`\nDone: ${ok} ok, ${fail} failed`);
}

main();
