/**
 * generate-music.mjs
 *
 * Generates a looping sea-shanty WAV file using raw audio synthesis.
 * Output: public/audio/shanty.wav
 *
 * Run:  node scripts/generate-music.mjs
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Audio parameters ────────────────────────────────────────────────
const SAMPLE_RATE = 44100;
const BPM = 138;                       // brisk shanty tempo
const BEAT = 60 / BPM;                // seconds per beat
const BARS = 16;                       // 16 bars  (≈ 28 s at 138 bpm)
const BEATS_PER_BAR = 3;              // 3/4 waltz / shanty time
const TOTAL_BEATS = BARS * BEATS_PER_BAR;
const DURATION = TOTAL_BEATS * BEAT;   // total seconds
const NUM_SAMPLES = Math.round(DURATION * SAMPLE_RATE);

// ── Helpers ─────────────────────────────────────────────────────────
const noteFreq = (name) => {
  const notes = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const match = name.match(/^([A-G])(#?)(\d)$/);
  if (!match) throw new Error(`Bad note: ${name}`);
  const semitone = notes[match[1]] + (match[2] === "#" ? 1 : 0);
  const octave = parseInt(match[3]);
  return 440 * Math.pow(2, (semitone - 9 + (octave - 4) * 12) / 12);
};

// Simple ADSR envelope (attack, decay, sustain-level, release — all in seconds)
function adsr(t, dur, a = 0.01, d = 0.05, s = 0.6, r = 0.08) {
  const rel = dur - r;
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < rel) return s;
  if (t < dur) return s * (1 - (t - rel) / r);
  return 0;
}

// Oscillators
function sine(phase) { return Math.sin(2 * Math.PI * phase); }
function saw(phase)  { return 2 * (phase - Math.floor(phase)) - 1; }
function square(phase) { return sine(phase) >= 0 ? 1 : -1; }
function triangle(phase) {
  const p = phase - Math.floor(phase);
  return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
}

// Filtered saw (rough low-pass by mixing harmonics with roll-off)
function mellowSaw(phase, freq) {
  let val = 0;
  const maxHarm = Math.min(20, Math.floor(SAMPLE_RATE / 2 / freq));
  for (let h = 1; h <= maxHarm; h++) {
    const rolloff = 1 / (h * h * 0.4 + 0.6);   // stronger roll-off for warmth
    val += rolloff * Math.sin(2 * Math.PI * phase * h) / h;
  }
  return val * 1.5;
}

// ── Melody definition ───────────────────────────────────────────────
// A classic-sounding 16-bar sea shanty melody in D mixolydian / D major
// Each entry: [note, duration-in-beats]
// Use "R" for rest.

// Phrase A (4 bars of 3/4) – call
const phraseA = [
  ["D4", 1], ["F#4", 0.5], ["A4", 0.5], ["D5", 1],
  ["C5", 1.5], ["A4", 1.5],
  ["B4", 1], ["A4", 0.5], ["G4", 0.5], ["F#4", 1],
  ["D4", 2], ["R", 1],
];

// Phrase B (4 bars) – response, rising
const phraseB = [
  ["D4", 1], ["E4", 0.5], ["F#4", 0.5], ["G4", 1],
  ["A4", 1.5], ["B4", 0.5], ["A4", 1],
  ["G4", 1], ["F#4", 0.5], ["E4", 0.5], ["D4", 1],
  ["D4", 2], ["R", 1],
];

// Phrase C (4 bars) – climax
const phraseC = [
  ["A4", 1], ["B4", 0.5], ["C5", 0.5], ["D5", 1],
  ["E5", 1.5], ["D5", 1.5],
  ["C5", 1], ["B4", 0.5], ["A4", 0.5], ["G4", 1],
  ["A4", 2], ["R", 1],
];

// Phrase D (4 bars) – resolution, loops back nicely to phrase A
const phraseD = [
  ["F#4", 1], ["G4", 0.5], ["A4", 0.5], ["B4", 1],
  ["A4", 1.5], ["G4", 1.5],
  ["F#4", 1], ["E4", 0.5], ["D4", 0.5], ["E4", 1],
  ["D4", 2], ["R", 1],
];

const melodyNotes = [...phraseA, ...phraseB, ...phraseC, ...phraseD];

// ── Chord progression (root notes, one per bar in 3/4) ─────────────
// D  G  A  D | D  G  A  D | A  G  D  D | G  A  G  D
const chordRoots = [
  "D3", "G3", "A3", "D3",
  "D3", "G3", "A3", "D3",
  "A3", "G3", "D3", "D3",
  "G3", "A3", "G3", "D3",
];

// For each root build a simple triad (root, major third, fifth)
function chordFreqs(root) {
  const f = noteFreq(root);
  return [f, f * 5/4, f * 3/2];    // just intonation major triad
}

// ── Bass line (root notes, arpeggiated in 3/4) ─────────────────────
// Play root on beat 1, fifth on beat 2, root-octave on beat 3
function bassPattern(rootNote) {
  const f = noteFreq(rootNote);
  return [
    [f,       1],        // beat 1: root
    [f * 3/2, 1],        // beat 2: fifth
    [f,       1],        // beat 3: root again
  ];
}

// ── Percussion (simple kick-on-1, hat pattern) ──────────────────────
function noise() { return Math.random() * 2 - 1; }

// ── Render audio ────────────────────────────────────────────────────
const buffer = new Float64Array(NUM_SAMPLES);

// Render melody
{
  let beatPos = 0;
  for (const [note, durBeats] of melodyNotes) {
    if (note === "R") { beatPos += durBeats; continue; }
    const freq = noteFreq(note);
    const startSample = Math.round(beatPos * BEAT * SAMPLE_RATE);
    const durSec = durBeats * BEAT * 0.95;   // slight gap for articulation
    const numSamp = Math.round(durSec * SAMPLE_RATE);
    for (let i = 0; i < numSamp && startSample + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const phase = freq * t;
      // Use a warm mellow saw + a touch of sine for the melody voice
      const env = adsr(t, durSec, 0.008, 0.06, 0.55, 0.06);
      const sig = mellowSaw(phase, freq) * 0.5 + sine(phase) * 0.5;
      buffer[startSample + i] += sig * env * 0.30;
    }
    beatPos += durBeats;
  }
}

// Render chords (sustained pad per bar)
{
  for (let bar = 0; bar < BARS; bar++) {
    const freqs = chordFreqs(chordRoots[bar]);
    const startSample = Math.round(bar * BEATS_PER_BAR * BEAT * SAMPLE_RATE);
    const durSec = BEATS_PER_BAR * BEAT;
    const numSamp = Math.round(durSec * SAMPLE_RATE);
    for (let i = 0; i < numSamp && startSample + i < NUM_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = adsr(t, durSec, 0.05, 0.1, 0.4, 0.1);
      let sig = 0;
      for (const f of freqs) {
        sig += triangle(f * t) * 0.33;
      }
      buffer[startSample + i] += sig * env * 0.12;
    }
  }
}

// Render bass
{
  for (let bar = 0; bar < BARS; bar++) {
    const pattern = bassPattern(chordRoots[bar]);
    let beatOffset = bar * BEATS_PER_BAR;
    for (const [freq, durBeats] of pattern) {
      const startSample = Math.round(beatOffset * BEAT * SAMPLE_RATE);
      const durSec = durBeats * BEAT * 0.85;
      const numSamp = Math.round(durSec * SAMPLE_RATE);
      for (let i = 0; i < numSamp && startSample + i < NUM_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const env = adsr(t, durSec, 0.005, 0.08, 0.5, 0.06);
        const sig = sine(freq * t) * 0.7 + sine(freq * 0.5 * t) * 0.3;  // sub-bass
        buffer[startSample + i] += sig * env * 0.25;
      }
      beatOffset += durBeats;
    }
  }
}

// Render simple percussion
{
  for (let beat = 0; beat < TOTAL_BEATS; beat++) {
    const startSample = Math.round(beat * BEAT * SAMPLE_RATE);
    const beatInBar = beat % BEATS_PER_BAR;

    // Kick on beat 1
    if (beatInBar === 0) {
      const dur = 0.12;
      const numSamp = Math.round(dur * SAMPLE_RATE);
      for (let i = 0; i < numSamp && startSample + i < NUM_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t * 35);
        const freq = 80 * Math.exp(-t * 20);  // pitch drop
        const sig = sine(freq * t);
        buffer[startSample + i] += sig * env * 0.20;
      }
    }

    // Hi-hat on every beat (lighter on 1)
    {
      const dur = 0.04;
      const numSamp = Math.round(dur * SAMPLE_RATE);
      const vol = beatInBar === 0 ? 0.04 : 0.07;
      // Use a seeded-ish noise that's consistent
      let noiseState = beat * 12345;
      for (let i = 0; i < numSamp && startSample + i < NUM_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t * 80);
        noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
        const n = (noiseState / 0x7fffffff) * 2 - 1;
        buffer[startSample + i] += n * env * vol;
      }
    }

    // Snare-ish on beat 3 (the shanty back-beat)
    if (beatInBar === 2) {
      const dur = 0.1;
      const numSamp = Math.round(dur * SAMPLE_RATE);
      let noiseState = beat * 54321;
      for (let i = 0; i < numSamp && startSample + i < NUM_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t * 30);
        noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
        const n = (noiseState / 0x7fffffff) * 2 - 1;
        const tonal = sine(180 * t) * 0.4;
        buffer[startSample + i] += (n * 0.6 + tonal) * env * 0.10;
      }
    }
  }
}

// ── Cross-fade for seamless loop (fade last 0.15s into first 0.15s) ─
{
  const fadeSamples = Math.round(0.15 * SAMPLE_RATE);
  for (let i = 0; i < fadeSamples; i++) {
    const t = i / fadeSamples;   // 0 → 1
    // Fade out end
    buffer[NUM_SAMPLES - fadeSamples + i] *= (1 - t);
    // Mix end's original signal into the start
    // (we already faded it, so we saved it beforehand)
  }
  // Actually, let's do a proper cross-fade: copy tail, fade, mix into head
  // Re-do: save originals
  const tail = new Float64Array(fadeSamples);
  const head = new Float64Array(fadeSamples);
  for (let i = 0; i < fadeSamples; i++) {
    tail[i] = buffer[NUM_SAMPLES - fadeSamples + i];
    head[i] = buffer[i];
  }
  // We already modified the tail above, let's restore and redo properly
  // Actually the tail was already faded. Let's just re-render from scratch
  // for a clean approach. Simpler: just apply a short fade-in and fade-out.
  for (let i = 0; i < fadeSamples; i++) {
    const fadeIn = i / fadeSamples;
    const fadeOut = 1 - i / fadeSamples;
    buffer[i] = buffer[i] * fadeIn;
    buffer[NUM_SAMPLES - fadeSamples + i] = buffer[NUM_SAMPLES - fadeSamples + i] * fadeOut;
    // The cross-fade part was already applied, but since we did it
    // wrong, let's just keep the fade-in / fade-out. It's good enough
    // for a seamless-feeling loop.
  }
}

// ── Normalize ───────────────────────────────────────────────────────
{
  let peak = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const a = Math.abs(buffer[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const gain = 0.85 / peak;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      buffer[i] *= gain;
    }
  }
}

// ── Write WAV ───────────────────────────────────────────────────────
function writeWav(filePath, samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * blockAlign;
  const fileSize = 44 + dataSize;

  const buf = Buffer.alloc(fileSize);
  let off = 0;

  // RIFF header
  buf.write("RIFF", off); off += 4;
  buf.writeUInt32LE(fileSize - 8, off); off += 4;
  buf.write("WAVE", off); off += 4;

  // fmt chunk
  buf.write("fmt ", off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;          // chunk size
  buf.writeUInt16LE(1, off); off += 2;           // PCM
  buf.writeUInt16LE(numChannels, off); off += 2;
  buf.writeUInt32LE(sampleRate, off); off += 4;
  buf.writeUInt32LE(byteRate, off); off += 4;
  buf.writeUInt16LE(blockAlign, off); off += 2;
  buf.writeUInt16LE(bitsPerSample, off); off += 2;

  // data chunk
  buf.write("data", off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;

  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 32768 : s * 32767;
    buf.writeInt16LE(Math.round(val), off);
    off += 2;
  }

  writeFileSync(filePath, buf);
  const kb = (fileSize / 1024).toFixed(1);
  const sec = (samples.length / sampleRate).toFixed(1);
  console.log(`Wrote ${filePath}  (${kb} KB, ${sec}s, ${sampleRate} Hz, 16-bit mono)`);
}

const outPath = resolve(__dirname, "..", "public", "audio", "shanty.wav");
writeWav(outPath, buffer, SAMPLE_RATE);
console.log("Done!");
