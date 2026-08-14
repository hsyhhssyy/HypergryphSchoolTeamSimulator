#!/usr/bin/env node
/**
 * Placeholder BGM generator — Todo 26.
 *
 * Synthesizes short, original CC0 placeholder tunes as 16-bit PCM WAV files.
 * Zero copyright: every note is a hand-written sine arpeggio composed for
 * this project (no samples, no melodies from existing works).
 *
 * The user may swap in properly licensed music later — see public/audio/README.md.
 *
 * Usage: node scripts/gen-placeholder-audio.mjs
 * Output: public/audio/track-0{1,2,3}.wav
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const AMPLITUDE = 0.32; // gentle peaks; never loud

/** Semitone offset -> frequency (A4 = 440Hz) */
const note = (semisFromA4) => 440 * 2 ** (semisFromA4 / 12);

/** A note in a track: [midi-ish semitone offset, start beat, duration in beats, velocity 0..1] */
const C_MAJOR_PENT = [0, 2, 4, 7, 9]; // offsets relative to root
const G_MAJOR_PENT = [-2, 0, 2, 4, 7];
const A_MINOR_PENT = [0, 3, 5, 7, 10];

const TRACKS = [
  {
    name: 'track-01',
    bpm: 72,
    root: note(-9), // C4
    scale: C_MAJOR_PENT,
    melody: [0, 1, 2, 3, 4, 3, 2, 1],
    bass: [0, 0, 4, 3, 2, 2, 3, 4],
    bassDuration: 2,
  },
  {
    name: 'track-02',
    bpm: 96,
    root: note(-7), // D4
    scale: G_MAJOR_PENT,
    melody: [2, 1, 3, 4, 2, 1, 3, 4, 1, 0, 2, 3, 4, 3, 2, 1],
    bass: [0, 3, 4, 2, 0, 3, 4, 5],
    bassDuration: 2,
  },
  {
    name: 'track-03',
    bpm: 84,
    root: note(-12), // A3
    scale: A_MINOR_PENT,
    melody: [0, 2, 1, 3, 4, 3, 2, 0],
    bass: [0, 0, 4, 2, 0, 0, 3, 2],
    bassDuration: 2,
  },
];

/**
 * Synthesize one track into a Float32Array of samples in [-1, 1].
 */
function synthesize({ bpm, root, scale, melody, bass, bassDuration }) {
  const beatSec = 60 / bpm;
  const totalBeats = Math.max(
    melody.length,
    bass.length * bassDuration,
  );
  const duration = totalBeats * beatSec + 2; // +2s tail for the fade
  const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  const envelope = (t, dur) => {
    const attack = 0.02;
    const release = 0.15;
    let a = Math.min(1, t / attack);
    let r = 1;
    const tail = dur - t;
    if (tail < release) r = Math.max(0, tail / release);
    return a * r;
  };
  const noteWave = (freq, t, vel) => {
    // Sine + a soft second harmonic for warmth; no vibrato, no noise.
    return (
      Math.sin(2 * Math.PI * freq * t) * 0.7 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.15
    ) * vel;
  };

  // Melody: one note per beat.
  melody.forEach((scaleIdx, i) => {
    const freq = root * 2 ** (scale[scaleIdx] / 12);
    const start = i * beatSec;
    const dur = beatSec * 1.8;
    for (let t = 0; t < dur; t += 1 / SAMPLE_RATE) {
      const s = start + t;
      const idx = Math.floor(s * SAMPLE_RATE);
      if (idx >= samples.length) break;
      samples[idx] += noteWave(freq, t, 0.5) * envelope(t, dur);
    }
  });

  // Soft bass: one note per `bassDuration` beats.
  bass.forEach((scaleIdx, i) => {
    const freq = root * 0.5 * 2 ** (scale[scaleIdx] / 12);
    const start = i * bassDuration * beatSec;
    const dur = bassDuration * beatSec * 1.9;
    for (let t = 0; t < dur; t += 1 / SAMPLE_RATE) {
      const s = start + t;
      const idx = Math.floor(s * SAMPLE_RATE);
      if (idx >= samples.length) break;
      samples[idx] += noteWave(freq, t, 0.35) * envelope(t, dur);
    }
  });

  // Fade-out over the last 1.5s so the loop edge is silent.
  const fadeSec = 1.5;
  const fadeStart = samples.length - fadeSec * SAMPLE_RATE;
  for (let i = Math.max(0, Math.floor(fadeStart)); i < samples.length; i++) {
    samples[i] *= (samples.length - i) / (samples.length - fadeStart);
  }
  return samples;
}

/** Float32 samples -> 16-bit little-endian mono WAV (RIFF/PCM). */
function toWav(samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767 * AMPLITUDE), 44 + i * 2);
  }
  return buf;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
mkdirSync(outDir, { recursive: true });

for (const track of TRACKS) {
  const wav = toWav(synthesize(track));
  const file = join(outDir, `${track.name}.wav`);
  writeFileSync(file, wav);
  const seconds = (wav.length - 44) / 2 / SAMPLE_RATE;
  console.log(`wrote ${file} (${(wav.length / 1024).toFixed(0)} KiB, ${seconds.toFixed(1)}s)`);
}
