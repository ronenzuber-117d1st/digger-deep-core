/**
 * Deterministic NES-style MIDI composer.
 * Run: npm run music
 * Generates every .mid file in public/assets/music/ from compact musical data.
 * Uses a seeded RNG (mulberry32) so output is byte-identical on every run.
 */

import pkg from '@tonejs/midi';
const { Midi } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../public/assets/music');

// ── Seeded RNG (same mulberry32 as core/rng.ts) ───────────────────────────────

function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Music theory ──────────────────────────────────────────────────────────────

const MAJOR    = [0, 2, 4, 5, 7, 9, 11];
const MINOR    = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN   = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

// Returns MIDI note: root + n-th scale degree (wraps across octaves, supports negatives)
function scaleStep(root, scale, degree) {
  const len   = scale.length;
  const oct   = Math.floor(degree / len);
  const idx   = ((degree % len) + len) % len;
  return root + oct * 12 + scale[idx];
}

// Semitones for triad tones relative to chord root
function chordTones(root, quality) {
  if (quality === 'M') return [root, root + 4, root + 7];
  if (quality === 'm') return [root, root + 3, root + 7];
  return [root, root + 4, root + 7];
}

// Weighted random pick from array using parallel weights array
function pickW(arr, weights, rng) {
  let total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

// Clamp midi note into range by octave
function clampOctave(midi, lo, hi) {
  while (midi < lo)  midi += 12;
  while (midi > hi) midi -= 12;
  return midi;
}

// Find which scale degree (0-based) the midi note best matches
function nearestScaleDeg(midi, root, scale) {
  const rel = ((midi - root) % 12 + 12) % 12;
  let best = 0, bestDist = 100;
  for (let i = 0; i < scale.length; i++) {
    const d = Math.min(Math.abs(scale[i] - rel), 12 - Math.abs(scale[i] - rel));
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// ── Duration helpers ──────────────────────────────────────────────────────────

function makeDurs(style, totalBeats, rng) {
  // Returns array of {isRest, beats} summing to totalBeats
  const result = [];
  let rem = totalBeats;

  const pools = {
    sparse:     [[2.0,3],[1.0,3],[0.5,2],[-1.0,2],[-0.5,1]],
    flowing:    [[1.0,4],[0.5,3],[0.25,2],[-0.5,1]],
    bouncy:     [[0.5,4],[0.25,3],[1.0,2],[-0.5,1]],
    floating:   [[2.0,2],[1.5,2],[1.0,3],[0.5,1],[-1.0,1]],
    aggressive: [[0.5,3],[0.25,4],[1.0,1]],
    riff:       [[0.5,2],[0.25,5],[0.75,2],[1.0,1]],
  };

  const pool = pools[style] || pools.flowing;

  while (rem > 0.01) {
    const dur = pickW(pool.map(x => x[0]), pool.map(x => x[1]), rng);
    const d   = Math.min(Math.abs(dur), rem);
    result.push({ isRest: dur < 0, beats: d });
    rem -= d;
  }
  return result;
}

// ── Lead melody generation ─────────────────────────────────────────────────────

function makeLead(spec, chords, sectionBars, spb, style, rng) {
  const notes = [];
  let timeS = 0;
  const barsPerChord = sectionBars / chords.length;

  let pitch = spec.key;  // start at root
  let repeated = 0;

  for (const [chordOffset, quality] of chords) {
    const chordRoot = spec.key + chordOffset;
    const ct = chordTones(clampOctave(chordRoot, spec.key - 2, spec.key + 12), quality);

    const chordBeats = barsPerChord * 4;
    const durs = makeDurs(style, chordBeats, rng);

    for (const { isRest, beats } of durs) {
      const dur = beats * spb;
      if (isRest) { timeS += dur; continue; }

      // Pitch selection: bias toward chord tones, stepwise movement
      const isCT = ct.some(n => n % 12 === pitch % 12);
      let step;
      if (repeated >= 3) {
        // Force movement
        step = pickW([-2,-1,1,2], [2,3,3,2], rng);
        repeated = 0;
      } else if (!isCT && rng() < 0.6) {
        // Move toward nearest chord tone
        const target = ct.reduce((a, b) =>
          Math.abs(b - pitch) < Math.abs(a - pitch) ? b : a, ct[0]);
        step = Math.sign(target - pitch);
        if (step === 0) step = 1;
      } else {
        step = pickW([-2,-1,0,1,2,3,-3], [2,4,3,4,2,1,1], rng);
      }

      // Move in scale
      const deg  = nearestScaleDeg(pitch, spec.key, spec.scale);
      pitch = scaleStep(spec.key, spec.scale, deg + step);
      pitch = clampOctave(pitch, spec.leadLo, spec.leadHi);

      if (step === 0) repeated++; else repeated = 1;

      // Short note gap (NES articulation)
      const gap = Math.min(0.025, dur * 0.1);
      notes.push({ time: timeS, midi: pitch, duration: dur - gap, velocity: 0.75 + rng() * 0.1 });
      timeS += dur;
    }
  }
  return notes;
}

// ── Harmony generation ─────────────────────────────────────────────────────────

function makeHarmony(spec, leadNotes, chords, sectionBars, spb, style, rng) {
  if (style === 'arpeggio' || style === 'highArpeggio') {
    return makeArpeggio(spec, chords, sectionBars, spb, style === 'highArpeggio', rng);
  }
  if (style === 'ostinato') {
    return makeOstinato(spec, chords, sectionBars, spb, rng);
  }
  // counter-melody: lead notes shifted down by a 3rd in scale
  return leadNotes.map(n => {
    const deg    = nearestScaleDeg(n.midi, spec.key, spec.scale);
    const below  = scaleStep(spec.key, spec.scale, deg - 2);
    const midi   = clampOctave(below, spec.leadLo, spec.leadHi);
    return { ...n, midi, velocity: n.velocity * 0.70 };
  });
}

function makeArpeggio(spec, chords, sectionBars, spb, high, rng) {
  const notes = [];
  let timeS = 0;
  const sixteenth = spb * 0.25;
  const barsPerChord = sectionBars / chords.length;

  for (const [chordOffset, quality] of chords) {
    const base = spec.key + chordOffset + (high ? 12 : 0);
    const ct   = chordTones(clampOctave(base, spec.leadLo, spec.leadHi), quality);
    const pat  = [ct[0], ct[1], ct[2], ct[0] + 12, ct[2], ct[1]];

    const totalBeats = barsPerChord * 4;
    let beat = 0;
    let pi   = 0;
    while (beat < totalBeats - 0.01) {
      const midi = clampOctave(pat[pi % pat.length], spec.leadLo, spec.leadHi);
      notes.push({ time: timeS + beat * spb, midi, duration: sixteenth * 0.85, velocity: 0.55 + rng() * 0.1 });
      beat += 0.25;
      pi++;
    }
    timeS += barsPerChord * 4 * spb;
  }
  return notes;
}

function makeOstinato(spec, chords, sectionBars, spb, rng) {
  const notes = [];
  let timeS = 0;
  const barsPerChord = sectionBars / chords.length;

  for (const [chordOffset] of chords) {
    const midi  = clampOctave(spec.key + chordOffset + 7, spec.leadLo, spec.leadHi);
    const total = barsPerChord * 4;
    let beat = 0;
    while (beat < total - 0.01) {
      notes.push({ time: timeS + beat * spb, midi, duration: spb * 0.4, velocity: 0.60 });
      beat += 0.5;
    }
    timeS += barsPerChord * 4 * spb;
  }
  return notes;
}

// ── Bass generation ────────────────────────────────────────────────────────────

function makeBass(spec, chords, sectionBars, spb, style, rng) {
  const notes = [];
  let timeS = 0;
  const barsPerChord = sectionBars / chords.length;

  for (const [chordOffset, quality] of chords) {
    const root  = clampOctave(spec.bassKey + chordOffset, spec.bassLo, spec.bassHi);
    const fifth = clampOctave(root + 7,  spec.bassLo, spec.bassHi);
    const oct   = clampOctave(root + 12, spec.bassLo, spec.bassHi);
    const total = barsPerChord * 4; // beats

    const addNote = (beat, midi, dur) => {
      notes.push({ time: timeS + beat * spb, midi, duration: dur * spb * 0.85, velocity: 0.78 });
    };

    if (style === 'slow') {
      // Half-note roots
      for (let b = 0; b < total; b += 2) addNote(b, root, 1.8);
    } else if (style === 'roots') {
      // Quarter notes, alternating root and fifth
      for (let b = 0; b < total; b++) {
        addNote(b, b % 2 === 0 ? root : fifth, 0.85);
      }
    } else if (style === 'jumpy') {
      // Root + octave jump pattern
      for (let b = 0; b < total; b++) {
        const isDown = b % 2 === 0;
        addNote(b,     isDown ? root : oct,  0.4);
        addNote(b + 0.5, isDown ? fifth : root, 0.4);
      }
    } else if (style === 'walking') {
      // Walking bass connecting chord roots
      const scale = spec.scale;
      let pos = nearestScaleDeg(root, spec.bassKey, scale);
      for (let b = 0; b < total; b++) {
        const midi = clampOctave(scaleStep(spec.bassKey, scale, pos), spec.bassLo, spec.bassHi);
        addNote(b, midi, 0.85);
        pos += (rng() < 0.7 ? 1 : -1);
      }
    } else if (style === 'sustained') {
      // Whole-note roots
      addNote(0, root, total - 0.1);
    } else if (style === 'ostinato') {
      // Driving eighth notes on root
      for (let b = 0; b < total; b += 0.5) addNote(b, root, 0.38);
    } else if (style === 'driving') {
      // Quarter notes, mostly root with occasional fifth
      for (let b = 0; b < total; b++) {
        addNote(b, b % 4 < 3 ? root : fifth, 0.85);
      }
    } else {
      // Default: root on 1, fifth on 3
      addNote(0, root, 0.85);
      addNote(2, fifth, 0.85);
      addNote(4, root, 0.85);
      addNote(6, fifth, 0.85);
    }

    timeS += barsPerChord * 4 * spb;
  }
  return notes;
}

// ── Drum generation ────────────────────────────────────────────────────────────

const GM_KICK    = 36;
const GM_SNARE   = 38;
const GM_CLOSEDHAT = 42;
const GM_OPENHAT   = 46;

function makeDrums(totalBars, spb, style, rng) {
  const notes = [];

  // pattern: [beatFraction, gm_note, velocity_base]
  const PATTERNS = {
    light:   [[0, GM_KICK, 0.75], [2, GM_CLOSEDHAT, 0.45], [0, GM_CLOSEDHAT, 0.50],
              [1, GM_CLOSEDHAT, 0.40], [3, GM_CLOSEDHAT, 0.40]],
    soft:    [[0, GM_KICK, 0.65], [0, GM_CLOSEDHAT, 0.45], [2, GM_CLOSEDHAT, 0.45]],
    steady:  [
      [0, GM_KICK, 0.85], [0, GM_CLOSEDHAT, 0.60],
      [0.5, GM_CLOSEDHAT, 0.40],
      [1, GM_SNARE, 0.70], [1, GM_CLOSEDHAT, 0.55],
      [1.5, GM_CLOSEDHAT, 0.40],
      [2, GM_KICK, 0.75], [2, GM_CLOSEDHAT, 0.60],
      [2.5, GM_CLOSEDHAT, 0.40],
      [3, GM_SNARE, 0.70], [3, GM_CLOSEDHAT, 0.55],
      [3.5, GM_CLOSEDHAT, 0.40],
    ],
    quiet:   [[0, GM_KICK, 0.55], [2, GM_CLOSEDHAT, 0.35], [1, GM_CLOSEDHAT, 0.30],
              [3, GM_CLOSEDHAT, 0.30]],
    minimal: [[0, GM_KICK, 0.60], [2, GM_CLOSEDHAT, 0.35]],
    heavy:   [
      [0, GM_KICK, 0.90], [0, GM_CLOSEDHAT, 0.65],
      [0.5, GM_CLOSEDHAT, 0.50],
      [1, GM_SNARE, 0.85], [1, GM_CLOSEDHAT, 0.60],
      [1.5, GM_CLOSEDHAT, 0.50],
      [2, GM_KICK, 0.80], [2, GM_CLOSEDHAT, 0.65],
      [2.5, GM_CLOSEDHAT, 0.50],
      [3, GM_SNARE, 0.85], [3, GM_CLOSEDHAT, 0.60],
      [3.5, GM_CLOSEDHAT, 0.50],
    ],
    intense: [
      [0, GM_KICK, 0.90], [0.25, GM_CLOSEDHAT, 0.55],
      [0.5, GM_CLOSEDHAT, 0.50],
      [0.75, GM_CLOSEDHAT, 0.50],
      [1, GM_SNARE, 0.85], [1.25, GM_CLOSEDHAT, 0.55],
      [1.5, GM_CLOSEDHAT, 0.50], [1.75, GM_CLOSEDHAT, 0.50],
      [2, GM_KICK, 0.85], [2.25, GM_CLOSEDHAT, 0.55],
      [2.5, GM_CLOSEDHAT, 0.50], [2.75, GM_CLOSEDHAT, 0.50],
      [3, GM_SNARE, 0.85], [3.25, GM_CLOSEDHAT, 0.55],
      [3.5, GM_CLOSEDHAT, 0.50], [3.75, GM_CLOSEDHAT, 0.50],
    ],
  };

  const FILLS = {
    steady:  [[0.25, GM_SNARE, 0.65], [0.5, GM_SNARE, 0.70], [0.75, GM_SNARE, 0.75]],
    heavy:   [[0.25, GM_SNARE, 0.75], [0.5, GM_SNARE, 0.80], [0.75, GM_SNARE, 0.85]],
    intense: [[0.125, GM_SNARE, 0.70], [0.25, GM_SNARE, 0.75], [0.375, GM_SNARE, 0.80],
              [0.5, GM_SNARE, 0.85], [0.625, GM_SNARE, 0.90], [0.75, GM_SNARE, 0.95]],
  };

  const pat  = PATTERNS[style] || PATTERNS.steady;
  const fill = FILLS[style] || FILLS.steady;

  for (let bar = 0; bar < totalBars; bar++) {
    const barTime   = bar * 4 * spb;
    const isFill    = (bar + 1) % 8 === 0;
    const isDropout = style !== 'intense' && (bar === 8 || bar === 9);

    if (isDropout) continue; // B-section dropout for contrast

    for (const [beat, note, vel] of pat) {
      if (isFill && beat >= 3) continue;
      notes.push({
        time: barTime + beat * spb,
        midi: note,
        duration: 0.04,
        velocity: vel * (0.9 + rng() * 0.1),
      });
    }
    if (isFill) {
      for (const [fbeat, note, vel] of fill) {
        notes.push({ time: barTime + 3 * spb + fbeat * spb, midi: note, duration: 0.04, velocity: vel });
      }
    }
  }
  return notes;
}

// ── Track specs ────────────────────────────────────────────────────────────────

const TRACKS = [
  {
    name: 'title', bpm: 100, bars: 16, hasVariation: false,
    key: 60, bassKey: 48, scale: MINOR,
    leadLo: 60, leadHi: 82, bassLo: 36, bassHi: 60,
    chordsA: [[0,'m'],[10,'M'],[8,'M'],[10,'M']],
    chordsB: [[8,'M'],[10,'M'],[0,'m'],[7,'M']],
    lead: 'sparse', harm: 'counter', bass: 'slow', drums: 'light',
    dropDrumsB: true, seed: 1001,
  },
  {
    name: 'base', bpm: 92, bars: 16, hasVariation: false,
    key: 67, bassKey: 55, scale: MAJOR,
    leadLo: 62, leadHi: 83, bassLo: 43, bassHi: 62,
    chordsA: [[0,'M'],[7,'M'],[9,'m'],[5,'M']],
    chordsB: [[5,'M'],[0,'M'],[7,'M'],[0,'M']],
    lead: 'flowing', harm: 'arpeggio', bass: 'roots', drums: 'soft',
    dropDrumsB: true, seed: 1002,
  },
  {
    name: 'topsoil', bpm: 128, bars: 24, hasVariation: true,
    key: 62, bassKey: 50, scale: MAJOR,
    leadLo: 60, leadHi: 84, bassLo: 38, bassHi: 60,
    chordsA: [[0,'M'],[5,'M'],[7,'M'],[0,'M']],
    chordsB: [[5,'M'],[7,'M'],[9,'m'],[7,'M']],
    lead: 'bouncy', harm: 'arpeggio', bass: 'jumpy', drums: 'steady',
    dropDrumsB: false, seed: 1003,
  },
  {
    name: 'fossil-bed', bpm: 96, bars: 16, hasVariation: false,
    key: 69, bassKey: 45, scale: MINOR,
    leadLo: 64, leadHi: 84, bassLo: 33, bassHi: 57,
    chordsA: [[0,'m'],[8,'M'],[10,'M'],[0,'m']],
    chordsB: [[8,'M'],[10,'M'],[5,'m'],[7,'M']],
    lead: 'sparse', harm: 'counter', bass: 'walking', drums: 'quiet',
    dropDrumsB: true, seed: 1004,
  },
  {
    name: 'crystal-depths', bpm: 116, bars: 16, hasVariation: false,
    key: 76, bassKey: 52, scale: LYDIAN,
    leadLo: 69, leadHi: 88, bassLo: 40, bassHi: 60,
    chordsA: [[0,'M'],[2,'M'],[0,'M'],[2,'M']],
    chordsB: [[11,'m'],[0,'M'],[2,'M'],[0,'M']],
    lead: 'floating', harm: 'highArpeggio', bass: 'sustained', drums: 'minimal',
    dropDrumsB: false, seed: 1005,
  },
  {
    name: 'fungal-hollow', bpm: 132, bars: 24, hasVariation: true,
    key: 62, bassKey: 50, scale: PHRYGIAN,
    leadLo: 60, leadHi: 82, bassLo: 38, bassHi: 60,
    chordsA: [[0,'m'],[1,'M'],[0,'m'],[1,'M']],
    chordsB: [[10,'M'],[8,'M'],[0,'m'],[1,'M']],
    lead: 'aggressive', harm: 'ostinato', bass: 'ostinato', drums: 'heavy',
    dropDrumsB: false, seed: 1006,
  },
  {
    name: 'magma-seams', bpm: 150, bars: 16, hasVariation: false,
    key: 64, bassKey: 40, scale: MINOR,
    leadLo: 60, leadHi: 84, bassLo: 28, bassHi: 52,
    chordsA: [[0,'m'],[10,'M'],[8,'M'],[7,'M']],
    chordsB: [[0,'m'],[10,'M'],[8,'M'],[0,'m']],
    lead: 'riff', harm: 'arpeggio', bass: 'driving', drums: 'intense',
    dropDrumsB: false, seed: 1007,
  },
  {
    name: 'frozen-vault', bpm: 105, bars: 16, hasVariation: false,
    key: 71, bassKey: 47, scale: MINOR,
    leadLo: 65, leadHi: 84, bassLo: 35, bassHi: 59,
    chordsA: [[0,'m'],[8,'M'],[10,'M'],[0,'m']],
    chordsB: [[8,'M'],[10,'M'],[7,'M'],[0,'m']],
    lead: 'flowing', harm: 'arpeggio', bass: 'roots', drums: 'quiet',
    dropDrumsB: true, seed: 1008,
  },
];

// ── Jingles (hardcoded, not generated) ────────────────────────────────────────

// Death: funeral march, 4 bars, A minor, 72 BPM (~13 s)
function buildDeathJingle() {
  const spb = 60 / 72;

  const toNotes = (arr, vel) => {
    let t = 0;
    return arr.map(([midi, dur]) => {
      const n = { time: t * spb, midi, duration: dur * spb * 0.88, velocity: vel };
      t += dur;
      return n;
    });
  };

  // Lead: A minor dotted-march figures (bar1 descends, bar2 resolves, bar3 rises, bar4 closes)
  const leadData = [
    [69,1.5],[67,0.5],[65,1.5],[64,0.5],  // Bar 1: A4 G4 F4 E4
    [62,1.0],[60,0.5],[59,0.5],[57,2.0],  // Bar 2: D4 C4 B3 A3
    [60,1.5],[62,0.5],[64,1.5],[65,0.5],  // Bar 3: C4 D4 E4 F4
    [64,1.5],[62,0.5],[60,1.0],[57,2.0],  // Bar 4: E4 D4 C4 A3
  ];

  // Harmony: parallel thirds below lead in A minor
  const harmData = [
    [65,1.5],[64,0.5],[62,1.5],[60,0.5],  // Bar 1: F4 E4 D4 C4
    [59,1.0],[57,0.5],[55,0.5],[53,2.0],  // Bar 2: B3 A3 G3 F3
    [57,1.5],[59,0.5],[60,1.5],[62,0.5],  // Bar 3: A3 B3 C4 D4
    [60,1.5],[59,0.5],[57,1.0],[53,2.0],  // Bar 4: C4 B3 A3 F3
  ];

  // Bass: half-notes on roots and fifths
  const bassData = [
    [45,2.0],[45,2.0],  // Bar 1: A2 A2
    [45,2.0],[52,2.0],  // Bar 2: A2 E3
    [48,2.0],[52,2.0],  // Bar 3: C3 E3
    [45,2.0],[45,2.0],  // Bar 4: A2 A2
  ];

  // Drums: kick on beats 0,2 — snare on 1,3 — slow and sparse
  const drums = [];
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4;
    drums.push({ time: (b + 0) * spb, midi: GM_KICK,  duration: 0.1, velocity: 0.75 });
    drums.push({ time: (b + 1) * spb, midi: GM_SNARE, duration: 0.1, velocity: 0.65 });
    drums.push({ time: (b + 2) * spb, midi: GM_KICK,  duration: 0.1, velocity: 0.65 });
    drums.push({ time: (b + 3) * spb, midi: GM_SNARE, duration: 0.1, velocity: 0.60 });
  }

  return { lead: toNotes(leadData, 0.80), harm: toNotes(harmData, 0.55), bass: toNotes(bassData, 0.65), drums };
}

// Victory: ascending fanfare ~3 s at 80 BPM
function buildVictoryJingle() {
  const spb = 60 / 80;
  const lead  = [[60,0.25],[64,0.25],[67,0.25],[72,0.5],[71,0.25],[72,0.25],[76,1.0]];
  const harm  = [[48,0.25],[52,0.25],[55,0.25],[60,0.5],[59,0.25],[60,0.25],[64,1.0]];
  const bass  = [[48,1.0],[50,0.5],[52,0.5],[53,2.0]];
  const drums = [
    [0, GM_KICK, 0.80],
    [1, GM_SNARE, 0.70],
    [2, GM_KICK, 0.85],
    [3, GM_SNARE, 0.80],
    [3.5, GM_OPENHAT, 0.70],
  ];
  const toNotes = (arr, spbV = spb) => {
    let t = 0;
    return arr.map(([midi, dur]) => {
      const n = { time: t, midi, duration: dur * spbV * 0.85, velocity: 0.80 };
      t += dur * spbV; return n;
    });
  };
  return {
    lead:  toNotes(lead),
    harm:  toNotes(harm),
    bass:  toNotes(bass),
    drums: drums.map(([beat, midi, vel]) => ({
      time: beat * spb, midi, duration: 0.04, velocity: vel,
    })),
  };
}

// ── Build + write a track ─────────────────────────────────────────────────────

function buildNotes(spec) {
  const rng   = makePRNG(spec.seed);
  const spb   = 60 / spec.bpm;
  const barsA = spec.bars <= 16 ? spec.bars / 2 : 8; // 8 bars for A section
  const barsB = spec.bars <= 16 ? spec.bars / 2 : 8;
  const offsetB = barsA * 4 * spb;

  // Section A: lead + harmony (both start at t=0)
  const leadA = makeLead(spec, spec.chordsA, barsA, spb, spec.lead, rng);
  const harmA = makeHarmony(spec, leadA, spec.chordsA, barsA, spb, spec.harm, makePRNG(spec.seed + 300));

  // Section B: generate lead + harmony at t=0, then shift both by offsetB
  const leadBRaw = makeLead(spec, spec.chordsB, barsB, spb, spec.lead, makePRNG(spec.seed + 100));
  const harmBRaw = makeHarmony(spec, leadBRaw, spec.chordsB, barsB, spb, spec.harm, makePRNG(spec.seed + 400));
  leadBRaw.forEach(n => { n.time += offsetB; });
  harmBRaw.forEach(n => { n.time += offsetB; });
  const leadB = leadBRaw;
  const harmB = harmBRaw;

  // Section A' variation (24-bar tracks): generate at t=0, shift after
  let leadAp = [], harmAp = [];
  if (spec.hasVariation) {
    const offsetAp = (barsA + barsB) * 4 * spb;
    const rng2 = makePRNG(spec.seed + 200);
    const rawLead = makeLead(spec, spec.chordsA, barsA, spb, spec.lead, rng2);
    // Change last ~quarter of notes
    const changeFrom = Math.max(0, rawLead.length - Math.ceil(rawLead.length / 4));
    for (let i = changeFrom; i < rawLead.length; i++) {
      const deg = nearestScaleDeg(rawLead[i].midi, spec.key, spec.scale);
      rawLead[i].midi = clampOctave(
        scaleStep(spec.key, spec.scale, deg + (rng2() < 0.5 ? 1 : 2)),
        spec.leadLo, spec.leadHi
      );
    }
    // Generate harmony before offset so counter-melody copies correct (t=0-based) times
    const rawH = makeHarmony(spec, rawLead, spec.chordsA, barsA, spb, spec.harm, makePRNG(spec.seed + 500));
    rawLead.forEach(n => { n.time += offsetAp; });
    rawH.forEach(n => { n.time += offsetAp; });
    leadAp = rawLead;
    harmAp = rawH;
  }

  const lead = [...leadA, ...leadB, ...leadAp];
  const harm = [...harmA, ...harmB, ...harmAp];

  // Bass
  const bassA = makeBass(spec, spec.chordsA, barsA, spb, spec.bass, makePRNG(spec.seed + 600));
  const bassB = makeBass(spec, spec.chordsB, barsB, spb, spec.bass, makePRNG(spec.seed + 700));
  bassB.forEach(n => { n.time += offsetB; });
  let bassAp = [];
  if (spec.hasVariation) {
    const offsetAp = (barsA + barsB) * 4 * spb;
    const rawBass = makeBass(spec, spec.chordsA, barsA, spb, spec.bass, makePRNG(spec.seed + 800));
    rawBass.forEach(n => { n.time += offsetAp; });
    bassAp = rawBass;
  }
  const bass = [...bassA, ...bassB, ...bassAp];

  // Drums
  let drumNotes = makeDrums(spec.bars, spb, spec.drums, makePRNG(spec.seed + 900));
  if (spec.dropDrumsB) {
    // Remove drums from bars 8-11 (B section start)
    const bStart = barsA * 4 * spb;
    const bEnd   = (barsA + 2) * 4 * spb;
    drumNotes = drumNotes.filter(n => !(n.time >= bStart && n.time < bEnd));
  }

  return { lead, harm, bass, drums: drumNotes };
}

function writeTrack(name, bpm, notes) {
  const midi = new Midi();
  midi.header.setTempo(bpm);

  const addTrack = (channel, noteArr) => {
    const t = midi.addTrack();
    t.channel = channel;
    for (const n of noteArr) {
      if (n.midi < 0 || n.midi > 127) continue;
      t.addNote({
        time:     n.time,
        midi:     Math.round(n.midi),
        duration: Math.max(0.01, n.duration),
        velocity: Math.min(1, Math.max(0.01, n.velocity)),
      });
    }
  };

  addTrack(0, notes.lead);
  addTrack(1, notes.harm);
  addTrack(2, notes.bass);
  addTrack(9, notes.drums);

  const bytes = midi.toArray();
  const filePath = path.join(OUT_DIR, `${name}.mid`);
  fs.writeFileSync(filePath, Buffer.from(bytes));
  console.log(`  wrote ${name}.mid  (lead:${notes.lead.length} harm:${notes.harm.length} bass:${notes.bass.length} drums:${notes.drums.length})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('Composing tracks…');
for (const spec of TRACKS) {
  const notes = buildNotes(spec);
  writeTrack(spec.name, spec.bpm, notes);
}

// Jingles
writeTrack('death',   72,  buildDeathJingle());
writeTrack('victory', 80, buildVictoryJingle());

console.log('Done. Output:', OUT_DIR);
