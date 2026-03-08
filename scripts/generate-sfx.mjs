#!/usr/bin/env node
/**
 * generate-sfx.mjs - Synthesize retro 8-bit sound effects as WAV files.
 *
 * Uses raw PCM synthesis (square waves, noise, frequency sweeps) with
 * simple amplitude envelopes.  No external audio libraries required.
 *
 * Usage:  node scripts/generate-sfx.mjs
 * Output: public/audio/{click,stairs,deck_change}.wav
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'audio');
fs.mkdirSync(OUT_DIR, { recursive: true });

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

// ── Sound definitions ──────────────────────────────────────────────────

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

  writeWav(path.join(OUT_DIR, 'click.wav'), samples);
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

  writeWav(path.join(OUT_DIR, 'stairs.wav'), samples);
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

  writeWav(path.join(OUT_DIR, 'deck_change.wav'), samples);
}

// ── Main ───────────────────────────────────────────────────────────────

console.log('Generating sound effects...');
generateClick();
generateStairs();
generateDeckChange();
console.log('Done!');
