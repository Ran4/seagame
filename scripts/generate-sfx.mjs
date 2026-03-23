#!/usr/bin/env node
/**
 * generate-sfx.mjs - Generate sound effects.
 *
 * Three generation methods, each sound picks one:
 *
 *   - 'procedural':  Raw PCM synthesis (square waves, noise, frequency sweeps).
 *                    No API key needed. Output: public/audio/sfx/*.wav
 *
 *   - 'openai':      OpenAI TTS API (gpt-4o-mini-tts). Generates voice-acted
 *                    sounds via text-to-speech with instructions. Requires
 *                    OPENAI_API_KEY in .env. Output: public/audio/sfx/*.wav
 *
 *   - 'elevenlabs':  ElevenLabs Sound Effects API (/v1/sound-generation).
 *                    Generates realistic sound effects from text descriptions.
 *                    Requires ELEVENLABS_API_KEY in .env.
 *                    Output: public/audio/elevenlabs-generated/*.mp3
 *                    Config: { text, duration_seconds?, prompt_influence? }
 *
 * Usage:  node scripts/generate-sfx.mjs
 *
 * Existing files are skipped. Delete a file to regenerate it.
 * The game (audio.ts) currently loads from elevenlabs-generated/.
 * Old procedural sounds are kept in sfx/ as fallback.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SFX_DIR = path.join(__dirname, '..', 'public', 'audio', 'sfx');
const ELEVENLABS_DIR = path.join(__dirname, '..', 'public', 'audio', 'elevenlabs-generated');
fs.mkdirSync(SFX_DIR, { recursive: true });
fs.mkdirSync(ELEVENLABS_DIR, { recursive: true });

// ── Load .env ─────────────────────────────────────────────────────────

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

// ── Sound definitions ─────────────────────────────────────────────────
//
// Each sound is one of:
//   { type: 'procedural', generate: fn }
//   { type: 'openai', voice, instructions, input }
//   { type: 'elevenlabs', text, duration_seconds?, prompt_influence? }

const SOUNDS = [
  { name: 'click',              type: 'procedural', generate: generateClick },
  { name: 'stairs',             type: 'procedural', generate: generateStairs },
  { name: 'deck_change',        type: 'procedural', generate: generateDeckChange },
  { name: 'lantern_light',      type: 'procedural', generate: generateLanternLight },
  { name: 'lantern_extinguish', type: 'procedural', generate: generateLanternExtinguish },
  {
    name: 'glug_male',
    type: 'elevenlabs',
    text: 'A man taking a few deep swigs from a rum bottle. Three low-pitched gulps followed by a short satisfied exhale.',
    duration_seconds: 3,
    prompt_influence: 0.8,
  },
  {
    name: 'glug_female',
    type: 'elevenlabs',
    text: 'A woman taking a few swigs from a rum bottle. Three gulps followed by a short satisfied exhale.',
    duration_seconds: 3,
    prompt_influence: 0.8,
  },
  {
    name: 'kiss',
    type: 'elevenlabs',
    text: 'A quick cartoon kiss sound effect. A short wet smooch "mwah" lip smack, playful and exaggerated.',
    duration_seconds: 1,
    prompt_influence: 0.8,
  },
  {
    name: 'click',
    type: 'elevenlabs',
    text: 'A short cheerful UI click blip sound, retro 8-bit game style chirp.',
    duration_seconds: 0.5,
    prompt_influence: 0.7,
  },
  {
    name: 'stairs',
    type: 'elevenlabs',
    text: 'Quick wooden footsteps going up creaky ship stairs. Four rapid taps on old wood.',
    duration_seconds: 1,
    prompt_influence: 0.8,
  },
  {
    name: 'deck_change',
    type: 'elevenlabs',
    text: 'A subtle short whoosh transition sound, like changing perspective or view. Soft and airy.',
    duration_seconds: 0.5,
    prompt_influence: 0.7,
  },
  {
    name: 'lantern_light',
    type: 'elevenlabs',
    text: 'Flint striking once, then a soft whoosh as an oil lantern wick catches fire. No echo or reverb.',
    duration_seconds: 1.5,
    prompt_influence: 0.8,
  },
  {
    name: 'lantern_extinguish',
    type: 'elevenlabs',
    text: 'A tiny flame being snuffed by wet fingertips. Brief fizzle and pop. Dry recording, no tail.',
    duration_seconds: 0.5,
    prompt_influence: 0.8,
  },
  { name: 'dance_clap',          type: 'procedural', generate: generateDanceClap },
  {
    name: 'dance_clap',
    type: 'elevenlabs',
    text: 'Three quick sharp handclaps in rapid succession — clap clap clap! Crisp, percussive, on a wooden ship deck. No reverb, dry recording.',
    duration_seconds: 1,
    prompt_influence: 0.9,
  },
  {
    name: 'harbor_arrive',
    type: 'elevenlabs',
    text: 'Wooden ship bumping gently against a dock, creaking wood, a rope being tied, seagulls in background. Harbor arrival.',
    duration_seconds: 3,
    prompt_influence: 0.8,
  },
  {
    name: 'tavern_brawl',
    type: 'elevenlabs',
    text: 'Two men throwing punches in a tavern. A fist hitting flesh, a grunt, something wooden breaking. Short barfight.',
    duration_seconds: 2,
    prompt_influence: 0.8,
  },
  {
    name: 'recruit',
    type: 'elevenlabs',
    text: 'A cheerful "Aye aye!" male pirate voice, enthusiastic and ready to serve. Short exclamation.',
    duration_seconds: 1,
    prompt_influence: 0.8,
  },
  {
    name: 'notice_board',
    type: 'elevenlabs',
    text: 'Paper rustling, a hand removing a notice from a wooden board. Short crinkle of parchment.',
    duration_seconds: 1,
    prompt_influence: 0.7,
  },
  {
    name: 'cat_meow',
    type: 'elevenlabs',
    text: 'A cute short cat meow. Single "mew" sound, small cat, friendly.',
    duration_seconds: 1,
    prompt_influence: 0.8,
  },
];

// ── WAV helpers ────────────────────────────────────────────────────────

const SAMPLE_RATE = 22050; // low rate for retro feel
const BITS = 8;
const NUM_CHANNELS = 1;

/** Write a mono 8-bit WAV file from a Float64Array of samples in [-1, 1]. */
function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * (BITS / 8);
  const blockAlign = NUM_CHANNELS * (BITS / 8);
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;

  // RIFF header
  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(fileSize, o); o += 4;
  buf.write('WAVE', o); o += 4;

  // fmt chunk
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;          // chunk size
  buf.writeUInt16LE(1, o); o += 2;           // PCM
  buf.writeUInt16LE(NUM_CHANNELS, o); o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buf.writeUInt32LE(byteRate, o); o += 4;
  buf.writeUInt16LE(blockAlign, o); o += 2;
  buf.writeUInt16LE(BITS, o); o += 2;

  // data chunk
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(dataSize, o); o += 4;

  for (let i = 0; i < numSamples; i++) {
    // 8-bit WAV is unsigned: 0-255, 128 = silence
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeUInt8(Math.round((clamped + 1) * 0.5 * 255), o);
    o += 1;
  }

  fs.writeFileSync(filePath, buf);
  console.log(`  wrote ${filePath}  (${(dataSize / 1024).toFixed(1)} KB, ${(numSamples / SAMPLE_RATE).toFixed(2)}s)`);
}

// ── Oscillators & utilities ────────────────────────────────────────────

function squareWave(t, freq) {
  return Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1;
}

function noise() {
  return Math.random() * 2 - 1;
}

/** Linear interpolation between a and b. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Simple attack-decay envelope. */
function adEnvelope(t, duration, attack, decay) {
  if (t < attack) return t / attack;
  const remaining = duration - attack;
  const decayStart = attack;
  if (t >= decayStart) {
    const progress = (t - decayStart) / remaining;
    return Math.max(0, 1 - progress ** decay);
  }
  return 1;
}

// ── OpenAI TTS generation ─────────────────────────────────────────────

async function generateWithOpenAI(outDir, name, config) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`  x ${name}.wav — OPENAI_API_KEY not set, skipping`);
    return;
  }

  console.log(`  generating ${name}.wav via OpenAI TTS...`);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: config.voice || 'onyx',
      instructions: config.instructions,
      input: config.input,
      response_format: 'wav',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  x ${name}.wav — OpenAI API error ${res.status}: ${err}`);
    return;
  }

  const arrayBuf = await res.arrayBuffer();
  const outPath = path.join(outDir, `${name}.wav`);
  fs.writeFileSync(outPath, Buffer.from(arrayBuf));
  const kb = (arrayBuf.byteLength / 1024).toFixed(1);
  console.log(`  wrote ${outPath}  (${kb} KB)`);
}

// ── ElevenLabs Sound Effects generation ───────────────────────────────

async function generateWithElevenLabs(outDir, name, config) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error(`  x ${name}.wav — ELEVENLABS_API_KEY not set, skipping`);
    return;
  }

  console.log(`  generating ${name}.wav via ElevenLabs Sound Effects...`);
  const body = { text: config.text };
  if (config.duration_seconds) body.duration_seconds = config.duration_seconds;
  if (config.prompt_influence != null) body.prompt_influence = config.prompt_influence;

  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  x ${name}.wav — ElevenLabs API error ${res.status}: ${err}`);
    return;
  }

  // Response body is the audio file (mp3 by default)
  const arrayBuf = await res.arrayBuffer();
  const outPath = path.join(outDir, `${name}.mp3`);
  fs.writeFileSync(outPath, Buffer.from(arrayBuf));
  const kb = (arrayBuf.byteLength / 1024).toFixed(1);
  console.log(`  wrote ${outPath}  (${kb} KB)`);
}

// ── Procedural sound definitions ──────────────────────────────────────

/**
 * 1. click.wav - Cheerful chirp/blip when clicking a crew member.
 *    Two quick rising square-wave tones in succession, like a retro "boop-beep".
 */
function generateClick() {
  const duration = 0.22; // seconds
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;
    let sample = 0;

    // First blip: 0-0.09s, rising from 600 -> 900 Hz
    if (t < 0.09) {
      const freq = lerp(600, 900, t / 0.09);
      const env = adEnvelope(t, 0.09, 0.005, 1.5);
      sample += squareWave(t, freq) * env * 0.5;
    }

    // Second blip: 0.07-0.18s, rising from 800 -> 1200 Hz (overlaps slightly)
    if (t >= 0.07 && t < 0.18) {
      const lt = t - 0.07;
      const freq = lerp(800, 1200, lt / 0.11);
      const env = adEnvelope(lt, 0.11, 0.005, 1.5);
      sample += squareWave(t, freq) * env * 0.55;
    }

    // Tiny third sparkle: 0.14-0.22s, high pitch
    if (t >= 0.14) {
      const lt = t - 0.14;
      const freq = lerp(1100, 1500, lt / 0.08);
      const env = adEnvelope(lt, 0.08, 0.003, 2.0);
      sample += squareWave(t, freq) * env * 0.3;
    }

    samples[i] = sample * 0.7; // master volume
  }

  writeWav(path.join(SFX_DIR, 'click.wav'), samples);
}

/**
 * 2. stairs.wav - Quick wooden footstep tapping on stairs.
 *    Several short noise bursts with a resonant low-frequency thump,
 *    spaced to sound like rapid steps.
 */
function generateStairs() {
  const duration = 0.45; // seconds
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  // 4 quick footstep "taps" at these times
  const stepTimes = [0.0, 0.10, 0.22, 0.34];
  const stepDuration = 0.07;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;

    for (const st of stepTimes) {
      if (t >= st && t < st + stepDuration) {
        const lt = t - st;
        const progress = lt / stepDuration;

        // Sharp attack, quick decay noise burst (wooden tap)
        const noiseEnv = Math.exp(-progress * 18) * (lt > 0.001 ? 1 : lt / 0.001);
        // Band-limit the noise a bit by mixing with a low resonant tone
        const noiseSample = noise() * noiseEnv * 0.45;

        // Wooden resonance: low square wave thump
        const thumpFreq = lerp(180, 120, progress);
        const thumpEnv = Math.exp(-progress * 14);
        const thump = squareWave(t, thumpFreq) * thumpEnv * 0.35;

        // Higher knock overtone
        const knockFreq = lerp(800, 400, progress);
        const knockEnv = Math.exp(-progress * 25);
        const knock = squareWave(t, knockFreq) * knockEnv * 0.2;

        sample += noiseSample + thump + knock;
      }
    }

    samples[i] = sample * 0.75;
  }

  writeWav(path.join(SFX_DIR, 'stairs.wav'), samples);
}

/**
 * 3. deck_change.wav - Subtle whoosh/transition for switching deck view.
 *    Filtered noise sweep with a gentle frequency ramp.
 */
function generateDeckChange() {
  const duration = 0.30;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  // We'll simulate a bandpass-filtered noise sweep by mixing noise with
  // a sine-modulated amplitude and adding a subtle tonal sweep.

  let prevNoise = 0; // simple low-pass state

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;
    let sample = 0;

    // Overall envelope: fade in, sustain, fade out
    const env = Math.sin(Math.PI * progress) ** 0.6;

    // Noise whoosh - low-pass filtered
    const rawNoise = noise();
    const lpAlpha = lerp(0.15, 0.6, progress); // sweep filter cutoff up
    prevNoise = prevNoise + lpAlpha * (rawNoise - prevNoise);
    sample += prevNoise * env * 0.5;

    // Subtle tonal sweep (sine wave rising in pitch) for "airy" quality
    const sweepFreq = lerp(200, 600, progress ** 0.7);
    const toneEnv = Math.sin(Math.PI * progress) ** 1.2;
    sample += Math.sin(2 * Math.PI * sweepFreq * t) * toneEnv * 0.15;

    // Higher harmonic shimmer
    const shimmerFreq = lerp(1200, 2400, progress);
    const shimmerEnv = Math.sin(Math.PI * progress) ** 2.0;
    sample += Math.sin(2 * Math.PI * shimmerFreq * t) * shimmerEnv * 0.08;

    samples[i] = sample * 0.8;
  }

  writeWav(path.join(SFX_DIR, 'deck_change.wav'), samples);
}

/**
 * 4. lantern_light.wav - Warm flickering ignition sound.
 *    A soft rising tone with crackle noise, like striking a match and a flame catching.
 */
function generateLanternLight() {
  const duration = 0.5;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;
    let sample = 0;

    // Match strike: short noise burst at the start
    if (t < 0.12) {
      const strikeEnv = Math.exp(-t / 0.02) * 0.6;
      sample += noise() * strikeEnv;
    }

    // Flame catching: warm rising tone
    if (t > 0.05) {
      const lt = t - 0.05;
      const flameProgress = lt / (duration - 0.05);
      const freq = lerp(200, 400, flameProgress ** 0.5);
      const env = Math.sin(Math.PI * flameProgress) ** 0.4 * 0.4;
      sample += squareWave(t, freq) * env;
      // Gentle crackle throughout
      sample += noise() * env * 0.15 * (1 + Math.sin(t * 80) * 0.5);
    }

    // Warm shimmer overtone
    if (t > 0.15) {
      const lt = t - 0.15;
      const shimmerEnv = Math.sin(Math.PI * (lt / (duration - 0.15))) ** 1.5 * 0.15;
      sample += Math.sin(2 * Math.PI * 600 * t) * shimmerEnv;
    }

    samples[i] = sample * 0.7;
  }

  writeWav(path.join(SFX_DIR, 'lantern_light.wav'), samples);
}

/**
 * 5. lantern_extinguish.wav - Quick puff/hiss of a flame being snuffed out.
 *    Short descending tone with a breathy noise burst.
 */
function generateLanternExtinguish() {
  const duration = 0.25;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  let prevNoise = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;
    let sample = 0;

    // Puff: quick breathy noise with fast decay
    const puffEnv = Math.exp(-progress * 6) * 0.5;
    const rawNoise = noise();
    const lpAlpha = lerp(0.4, 0.1, progress); // filter closes as sound fades
    prevNoise = prevNoise + lpAlpha * (rawNoise - prevNoise);
    sample += prevNoise * puffEnv;

    // Descending tone: flame dying out
    const freq = lerp(350, 100, progress ** 0.7);
    const toneEnv = Math.exp(-progress * 8) * 0.3;
    sample += squareWave(t, freq) * toneEnv;

    samples[i] = sample * 0.8;
  }

  writeWav(path.join(SFX_DIR, 'lantern_extinguish.wav'), samples);
}

/**
 * 6. dance_clap.wav - Single sharp handclap.
 *    Short noise burst with resonant pop, like clapping hands on a ship deck.
 */
function generateDanceClap() {
  const duration = 0.12;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;
    let sample = 0;

    // Sharp filtered noise burst
    const env = Math.exp(-progress * 25) * (t < 0.001 ? t / 0.001 : 1);
    sample += noise() * env * 0.6;

    // Resonant pop at ~1.5kHz
    const popEnv = Math.exp(-progress * 35);
    sample += Math.sin(2 * Math.PI * 1500 * t) * popEnv * 0.3;

    // Higher overtone at ~3kHz for snap
    const snapEnv = Math.exp(-progress * 50);
    sample += Math.sin(2 * Math.PI * 3000 * t) * snapEnv * 0.15;

    samples[i] = sample * 0.8;
  }

  writeWav(path.join(SFX_DIR, 'dance_clap.wav'), samples);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating sound effects...');

  for (const sound of SOUNDS) {
    const outDir = sound.type === 'elevenlabs' ? ELEVENLABS_DIR : SFX_DIR;
    const ext = sound.type === 'elevenlabs' ? 'mp3' : 'wav';
    const outPath = path.join(outDir, `${sound.name}.${ext}`);
    if (fs.existsSync(outPath)) {
      console.log(`  skip ${sound.name}.${ext} (exists in ${path.basename(outDir)}/)`);
      continue;
    }

    if (sound.type === 'procedural') {
      sound.generate();
    } else if (sound.type === 'openai') {
      await generateWithOpenAI(outDir, sound.name, sound);
    } else if (sound.type === 'elevenlabs') {
      await generateWithElevenLabs(outDir, sound.name, sound);
    }
  }

  console.log('Done!');
}

main();
