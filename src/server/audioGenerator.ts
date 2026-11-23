import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 22050;

function writeWavFile(filePath: string, samples: Float32Array): void {
  const numSamples = samples.length;
  const dataByteLength = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // Byte rate
  buffer.writeUInt16LE(2, 32); // Block align
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-0.98, Math.min(0.98, samples[i]));
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface LofiRecipe {
  filename: string;
  bpm: number;
  bars: number;
  chords: number[][]; // 4-bar chord progression (MIDI notes)
  bassNotes: number[];
  melodyPattern: (number | null)[];
  seed: number;
}

const LOFI_RECIPES: LofiRecipe[] = [
  {
    filename: 'track-01.wav',
    bpm: 72,
    bars: 12,
    chords: [
      [50, 57, 60, 64, 67], // Dm9
      [43, 55, 59, 62, 65], // G13
      [48, 55, 59, 62, 67], // Cmaj9
      [45, 55, 57, 60, 64], // Am7
    ],
    bassNotes: [38, 43, 36, 33],
    melodyPattern: [72, null, 74, 76, null, 72, 69, null, 67, null, 69, 71, 72, null, null, null],
    seed: 101,
  },
  {
    filename: 'track-02.wav',
    bpm: 68,
    bars: 12,
    chords: [
      [53, 57, 60, 64], // Fmaj7
      [52, 55, 59, 62], // Em7
      [50, 53, 57, 60], // Dm7
      [48, 52, 55, 59], // Cmaj7
    ],
    bassNotes: [41, 40, 38, 36],
    melodyPattern: [69, null, 72, null, 71, 69, 67, null, 64, null, 67, 69, null, 64, null, null],
    seed: 202,
  },
  {
    filename: 'track-03.wav',
    bpm: 75,
    bars: 12,
    chords: [
      [45, 55, 59, 60, 64], // Am9
      [41, 53, 57, 60, 64], // Fmaj7
      [50, 57, 60, 64, 67], // Dm9
      [40, 52, 56, 59, 62], // E7
    ],
    bassNotes: [33, 29, 38, 28],
    melodyPattern: [76, null, 74, 72, null, 69, null, 72, 74, null, 72, 69, 68, null, null, null],
    seed: 303,
  },
  {
    filename: 'track-04.wav',
    bpm: 70,
    bars: 12,
    chords: [
      [51, 55, 58, 62], // Ebmaj7
      [48, 55, 58, 62, 63], // Cm9
      [44, 51, 55, 58, 63], // Abmaj9
      [46, 53, 56, 60, 62], // Bb13
    ],
    bassNotes: [39, 36, 32, 34],
    melodyPattern: [70, null, 74, 75, null, 70, 67, null, 68, null, 70, 72, 74, null, null, null],
    seed: 404,
  },
  {
    filename: 'track-05.wav',
    bpm: 66,
    bars: 12,
    chords: [
      [43, 55, 59, 62, 66], // Gmaj7
      [40, 52, 56, 59, 62], // E7
      [45, 55, 59, 60, 64], // Am9
      [50, 54, 57, 60, 64], // D9
    ],
    bassNotes: [31, 28, 33, 38],
    melodyPattern: [71, null, 74, null, 78, 76, 74, null, 72, null, 71, 69, 66, null, null, null],
    seed: 505,
  },
];

function synthesizeLofiTrack(recipe: LofiRecipe): Float32Array {
  const secPerBeat = 60 / recipe.bpm;
  const barSec = secPerBeat * 4;
  const totalSec = recipe.bars * barSec;
  const totalSamples = Math.floor(totalSec * SAMPLE_RATE);
  const out = new Float32Array(totalSamples);
  const rand = seededRand(recipe.seed);

  // 1. Warm Rhodes-like chord pads + gentle tape wobble + subtle vinyl crackle
  const barSamples = Math.floor(barSec * SAMPLE_RATE);
  for (let bar = 0; bar < recipe.bars; bar++) {
    const chord = recipe.chords[bar % recipe.chords.length];
    const bassMidi = recipe.bassNotes[bar % recipe.bassNotes.length];
    const bassFreq = midiToFreq(bassMidi);
    const barStart = bar * barSamples;
    const barEnd = Math.min(totalSamples, (bar + 1) * barSamples);

    for (let i = barStart; i < barEnd; i++) {
      const tLocal = (i - barStart) / SAMPLE_RATE;
      const tGlobal = i / SAMPLE_RATE;
      // Subtle pitch wow
      const wow = 1 + 0.0018 * Math.sin(2 * Math.PI * 0.45 * tGlobal);

      // Chord envelope (soft attack, warm decay)
      const atk = Math.min(1, tLocal / 0.045);
      const rel = Math.max(0, Math.min(1, (barSec - tLocal) / 0.18));
      const chordEnv = atk * rel * Math.exp(-tLocal * 0.42);

      let chordSum = 0;
      for (let n = 0; n < chord.length; n++) {
        const f = midiToFreq(chord[n]) * wow;
        // Electric piano fundamental + gentle 2nd harmonic bell
        const bell = Math.exp(-tLocal * 2.4) * 0.22;
        chordSum +=
          Math.sin(2 * Math.PI * f * tLocal) * 0.72 +
          Math.sin(2 * Math.PI * f * 2 * tLocal) * bell;
      }
      chordSum = (chordSum / chord.length) * chordEnv * 0.32;

      // Warm sub-bass
      const bassAtk = Math.min(1, tLocal / 0.03);
      const bassRel = Math.max(0, Math.min(1, (barSec - tLocal) / 0.12));
      const bassSample =
        Math.sin(2 * Math.PI * bassFreq * wow * tLocal) *
        bassAtk *
        bassRel *
        Math.exp(-tLocal * 0.25) *
        0.26;

      out[i] += chordSum + bassSample;
    }
  }

  // 2. Gentle Lo-Fi Melody notes (16th/8th step grid per bar)
  const stepSec = barSec / 8;
  const stepSamples = Math.floor(stepSec * SAMPLE_RATE);
  for (let bar = 0; bar < recipe.bars; bar++) {
    // Melody enters subtly on bars 2..bars-1
    if (bar === 0) continue;
    for (let s = 0; s < 8; s++) {
      const note =
        recipe.melodyPattern[(bar * 8 + s) % recipe.melodyPattern.length];
      if (note === null) continue;

      const startIdx = bar * barSamples + s * stepSamples;
      const noteLen = Math.floor(stepSec * 1.8 * SAMPLE_RATE);
      const freq = midiToFreq(note);

      for (let k = 0; k < noteLen && startIdx + k < totalSamples; k++) {
        const t = k / SAMPLE_RATE;
        const env =
          Math.min(1, t / 0.02) * Math.exp(-t * 3.1) * 0.14;
        const vibrato = 1 + 0.0025 * Math.sin(2 * Math.PI * 4.5 * t);
        out[startIdx + k] +=
          (Math.sin(2 * Math.PI * freq * vibrato * t) * 0.8 +
            Math.sin(2 * Math.PI * freq * 2 * t) * 0.15) *
          env;
      }
    }
  }

  // 3. Soft Boom-Bap Lo-Fi Drums (Kick on 1 & 2.5, Soft Snare on 2 & 4, Brush Hat on 8ths)
  const beatSamples = Math.floor(secPerBeat * SAMPLE_RATE);
  const eighthSamples = Math.floor((secPerBeat / 2) * SAMPLE_RATE);
  for (let bar = 0; bar < recipe.bars; bar++) {
    const b0 = bar * barSamples;
    const kicks = [0, Math.floor(2.5 * beatSamples)];
    for (const offset of kicks) {
      const start = b0 + offset;
      const len = Math.floor(0.18 * SAMPLE_RATE);
      for (let k = 0; k < len && start + k < totalSamples; k++) {
        const t = k / SAMPLE_RATE;
        const f = 48 + 75 * Math.exp(-t * 28);
        const env = Math.min(1, t / 0.004) * Math.exp(-t * 15);
        out[start + k] += Math.sin(2 * Math.PI * f * t) * env * 0.32;
      }
    }

    const snares = [beatSamples, 3 * beatSamples];
    for (const offset of snares) {
      const start = b0 + offset;
      const len = Math.floor(0.12 * SAMPLE_RATE);
      let lp = 0;
      for (let k = 0; k < len && start + k < totalSamples; k++) {
        const t = k / SAMPLE_RATE;
        const noise = rand() * 2 - 1;
        lp = lp * 0.72 + noise * 0.28;
        const body = Math.sin(2 * Math.PI * 165 * t) * Math.exp(-t * 24);
        const env = Math.min(1, t / 0.003) * Math.exp(-t * 20);
        out[start + k] += (lp * 0.75 + body * 0.35) * env * 0.18;
      }
    }

    for (let h = 0; h < 8; h++) {
      const swing = h % 2 === 1 ? Math.floor(eighthSamples * 0.08) : 0;
      const start = b0 + h * eighthSamples + swing;
      const len = Math.floor(0.035 * SAMPLE_RATE);
      let prev = 0;
      for (let k = 0; k < len && start + k < totalSamples; k++) {
        const t = k / SAMPLE_RATE;
        const n = rand() * 2 - 1;
        const hp = n - prev * 0.85;
        prev = n;
        const env = Math.exp(-t * 85) * (h % 2 === 0 ? 0.045 : 0.028);
        out[start + k] += hp * env;
      }
    }
  }

  // 4. Warm Low-pass smoothing + Vinyl crackle + 1.2s fade in/out for smooth transitions
  let lp1 = 0;
  let lp2 = 0;
  const fadeSamples = Math.floor(1.2 * SAMPLE_RATE);
  for (let i = 0; i < totalSamples; i++) {
    const crackle = rand() > 0.9993 ? (rand() - 0.5) * 0.05 : 0;
    const hiss = (rand() - 0.5) * 0.0035;
    lp1 = lp1 * 0.58 + (out[i] + hiss) * 0.42;
    lp2 = lp2 * 0.35 + lp1 * 0.65;
    let fade = 1;
    if (i < fadeSamples) fade = i / fadeSamples;
    else if (i > totalSamples - fadeSamples) {
      fade = (totalSamples - i) / fadeSamples;
    }
    out[i] = Math.tanh((lp2 + crackle) * 1.15) * 0.75 * fade;
  }

  return out;
}

function makeSeamlessLoop(raw: Float32Array, crossfadeSamples: number): Float32Array {
  const loopLen = raw.length - crossfadeSamples;
  const out = new Float32Array(loopLen);
  for (let i = 0; i < loopLen; i++) {
    if (i < crossfadeSamples) {
      const alpha = i / crossfadeSamples;
      out[i] = raw[i] * alpha + raw[loopLen + i] * (1 - alpha);
    } else {
      out[i] = raw[i];
    }
  }
  return out;
}

function synthesizeRainLoop(): Float32Array {
  const durationSec = 22;
  const cf = Math.floor(2.0 * SAMPLE_RATE);
  const raw = new Float32Array(durationSec * SAMPLE_RATE + cf);
  const rand = seededRand(777);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = rand() * 2 - 1;
    b0 = 0.997 * b0 + white * 0.029;
    b1 = 0.985 * b1 + white * 0.032;
    b2 = 0.95 * b2 + white * 0.048;
    const pink = (b0 + b1 + b2 + white * 0.08) * 0.35;
    raw[i] = pink * 0.55;
  }

  // Subtle individual water drops
  for (let d = 0; d < 280; d++) {
    const start = Math.floor(rand() * (raw.length - 1200));
    const freq = 900 + rand() * 1400;
    const amp = 0.025 + rand() * 0.04;
    for (let k = 0; k < 900; k++) {
      const t = k / SAMPLE_RATE;
      raw[start + k] +=
        Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 95) * amp;
    }
  }

  return makeSeamlessLoop(raw, cf);
}

function synthesizeWavesLoop(): Float32Array {
  const durationSec = 24;
  const cf = Math.floor(2.5 * SAMPLE_RATE);
  const raw = new Float32Array(durationSec * SAMPLE_RATE + cf);
  const rand = seededRand(888);

  let brown = 0;
  let surf = 0;
  for (let i = 0; i < raw.length; i++) {
    const t = i / SAMPLE_RATE;
    const white = rand() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    surf = surf * 0.88 + white * 0.12;

    // 0.125 Hz wave cycle (~8s per swell, periodic at 24s)
    const swell = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (t / 8.0)), 1.6);
    const foam = surf * swell * 0.45;
    const deep = brown * (0.6 + 0.4 * swell) * 1.4;
    raw[i] = Math.tanh((foam + deep) * 0.7) * 0.6;
  }

  return makeSeamlessLoop(raw, cf);
}

function synthesizeKeyboardLoop(): Float32Array {
  const durationSec = 20;
  const cf = Math.floor(1.0 * SAMPLE_RATE);
  const raw = new Float32Array(durationSec * SAMPLE_RATE + cf);
  const rand = seededRand(999);

  // Subtle room tone
  let room = 0;
  for (let i = 0; i < raw.length; i++) {
    room = room * 0.96 + (rand() * 2 - 1) * 0.002;
    raw[i] = room;
  }

  // Organic bursts of soft mechanical keystrokes
  let cursor = Math.floor(0.25 * SAMPLE_RATE);
  while (cursor < raw.length - SAMPLE_RATE) {
    const burstKeys = 5 + Math.floor(rand() * 14);
    for (let k = 0; k < burstKeys && cursor < raw.length - 2000; k++) {
      const isSpace = k === burstKeys - 1 || rand() > 0.84;
      const baseFreq = isSpace ? 175 + rand() * 45 : 320 + rand() * 180;
      const len = Math.floor((isSpace ? 0.045 : 0.028) * SAMPLE_RATE);
      const amp = isSpace ? 0.24 : 0.14 + rand() * 0.08;
      let lp = 0;
      for (let j = 0; j < len; j++) {
        const t = j / SAMPLE_RATE;
        const click =
          Math.sin(2 * Math.PI * baseFreq * t) * Math.exp(-t * 140) +
          (rand() * 2 - 1) * Math.exp(-t * 210) * 0.6;
        lp = lp * 0.55 + click * 0.45;
        raw[cursor + j] += lp * amp;
      }
      cursor += Math.floor((0.085 + rand() * 0.11) * SAMPLE_RATE);
    }
    // Natural thinking pause between phrases
    cursor += Math.floor((0.45 + rand() * 1.2) * SAMPLE_RATE);
  }

  return makeSeamlessLoop(raw, cf);
}

export interface GeneratedAudioManifest {
  tracks: Array<{
    position: number;
    title: string;
    artist: string;
    license: string;
    source_url: string;
    audio_url: string;
    duration_sec: number;
  }>;
  ambient: Array<{
    id: string;
    channel: 'rain' | 'waves' | 'keyboard';
    title: string;
    artist: string;
    license: string;
    source_url: string;
    audio_url: string;
  }>;
}

const TRACK_METADATA = [
  { title: 'Lluvia en la Ventana', artist: 'Bruma Nocturna' },
  { title: 'Café de Medianoche', artist: 'Estación Sur' },
  { title: 'Órbita Tranquila', artist: 'Selenita' },
  { title: 'Luces del Puerto', artist: 'Bruma Nocturna' },
  { title: 'Cuaderno Abierto', artist: 'Selenita' },
];

export function ensureAudioAssets(baseDir: string): GeneratedAudioManifest {
  const tracksDir = path.join(baseDir, 'tracks');
  const ambientDir = path.join(baseDir, 'ambient');
  fs.mkdirSync(tracksDir, { recursive: true });
  fs.mkdirSync(ambientDir, { recursive: true });

  const tracks = LOFI_RECIPES.map((recipe, idx) => {
    const filePath = path.join(tracksDir, recipe.filename);
    const secPerBeat = 60 / recipe.bpm;
    const durationSec = Number((recipe.bars * secPerBeat * 4).toFixed(2));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1024) {
      const samples = synthesizeLofiTrack(recipe);
      writeWavFile(filePath, samples);
    }
    const meta = TRACK_METADATA[idx];
    return {
      position: idx + 1,
      title: meta.title,
      artist: meta.artist,
      license: 'CC0 1.0 (Dominio público)',
      source_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      audio_url: `/audio/tracks/${recipe.filename}`,
      duration_sec: durationSec,
    };
  });

  const rainPath = path.join(ambientDir, 'rain.wav');
  if (!fs.existsSync(rainPath) || fs.statSync(rainPath).size < 1024) {
    writeWavFile(rainPath, synthesizeRainLoop());
  }

  const wavesPath = path.join(ambientDir, 'waves.wav');
  if (!fs.existsSync(wavesPath) || fs.statSync(wavesPath).size < 1024) {
    writeWavFile(wavesPath, synthesizeWavesLoop());
  }

  const keyboardPath = path.join(ambientDir, 'keyboard.wav');
  if (!fs.existsSync(keyboardPath) || fs.statSync(keyboardPath).size < 1024) {
    writeWavFile(keyboardPath, synthesizeKeyboardLoop());
  }

  return {
    tracks,
    ambient: [
      {
        id: 'rain',
        channel: 'rain',
        title: 'Lluvia nocturna continua',
        artist: 'Planeta Lo-Fi Audio',
        license: 'CC0 1.0 (Dominio público)',
        source_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        audio_url: '/audio/ambient/rain.wav',
      },
      {
        id: 'waves',
        channel: 'waves',
        title: 'Olas suaves del océano',
        artist: 'Planeta Lo-Fi Audio',
        license: 'CC0 1.0 (Dominio público)',
        source_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        audio_url: '/audio/ambient/waves.wav',
      },
      {
        id: 'keyboard',
        channel: 'keyboard',
        title: 'Teclado mecánico suave',
        artist: 'Planeta Lo-Fi Audio',
        license: 'CC0 1.0 (Dominio público)',
        source_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        audio_url: '/audio/ambient/keyboard.wav',
      },
    ],
  };
}
