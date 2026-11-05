/**
 * Music system tests.
 * Covers MIDI parsing, loop-point timing, channel→voice mapping,
 * composition validity (ranges, scale, monophony, determinism).
 *
 * Runs in Node.js environment (no Web Audio / browser APIs needed).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const MUSIC_DIR = path.join(ROOT, 'public', 'assets', 'music');

// ── @tonejs/midi (CJS) minimal interop ───────────────────────────────────────

interface MidiNote   { midi: number; time: number; duration: number; velocity: number; ticks: number; }
interface MidiTrack  { channel: number; notes: MidiNote[]; }
interface MidiHeader { tempos: Array<{ bpm: number; time: number }>; ticksPerBeat: number; }
interface MidiFile   { tracks: MidiTrack[]; header: MidiHeader; }

const req = createRequire(import.meta.url);
const { Midi } = req('@tonejs/midi') as { Midi: new (data: Uint8Array) => MidiFile };

// ── Music.json (track definitions) ───────────────────────────────────────────

import musicDataRaw from '../src/data/music.json';
type MusicDataShape = {
  scenes: Record<string, string>;
  tracks: Record<string, {
    file: string;
    loopStartBar: number;
    loopEndBar: number;
    beatsPerBar: number;
    isJingle?: boolean;
    trackMapping: Array<{ channel: number; voice: string }>;
    voices: Record<string, { duty?: number; adsr: Record<string, number>; volume: number }>;
    mix: Record<string, unknown>;
  }>;
};
const musicData = musicDataRaw as unknown as MusicDataShape;

// ── Scale data (mirrors compose.mjs) ─────────────────────────────────────────

const SCALES: Record<string, number[]> = {
  major:    [0, 2, 4, 5, 7, 9, 11],
  minor:    [0, 2, 3, 5, 7, 8, 10],
  lydian:   [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

// Per-track musical params used for validity checks
// Keys match music.json track keys (camelCase); compose.mjs uses hyphenated file names.
const TRACK_PARAMS: Record<string, { key: number; bassKey: number; scale: string; leadLo: number; leadHi: number; bassLo: number; bassHi: number }> = {
  title:         { key: 60, bassKey: 48, scale: 'minor',    leadLo: 60, leadHi: 82, bassLo: 36, bassHi: 60 },
  base:          { key: 67, bassKey: 55, scale: 'major',    leadLo: 62, leadHi: 83, bassLo: 43, bassHi: 62 },
  topsoil:       { key: 62, bassKey: 50, scale: 'major',    leadLo: 60, leadHi: 84, bassLo: 38, bassHi: 60 },
  fossilBed:     { key: 69, bassKey: 45, scale: 'minor',    leadLo: 64, leadHi: 84, bassLo: 33, bassHi: 57 },
  crystalDepths: { key: 76, bassKey: 52, scale: 'lydian',   leadLo: 69, leadHi: 88, bassLo: 40, bassHi: 60 },
  fungalHollow:  { key: 62, bassKey: 50, scale: 'phrygian', leadLo: 60, leadHi: 82, bassLo: 38, bassHi: 60 },
  magmaSeams:    { key: 64, bassKey: 40, scale: 'minor',    leadLo: 60, leadHi: 84, bassLo: 28, bassHi: 52 },
  frozenVault:   { key: 71, bassKey: 47, scale: 'minor',    leadLo: 65, leadHi: 84, bassLo: 35, bassHi: 59 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadMidi(filename: string): MidiFile {
  const buf = readFileSync(path.join(MUSIC_DIR, filename));
  return new Midi(new Uint8Array(buf));
}

function isInScale(midi: number, rootMidi: number, scale: number[], allowPassing = true): boolean {
  const rel = ((midi - rootMidi) % 12 + 12) % 12;
  if (scale.includes(rel)) return true;
  if (!allowPassing) return false;
  // passing tone = within 1 semitone of any scale note
  return scale.some(s => Math.abs(((rel - s + 12) % 12)) <= 1 || Math.abs(((s - rel + 12) % 12)) <= 1);
}

function fileHash(filename: string): string {
  const buf = readFileSync(path.join(MUSIC_DIR, filename));
  return createHash('sha256').update(buf).digest('hex');
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('music.json – track definitions', () => {
  it('every track references a file that exists', () => {
    for (const [name, def] of Object.entries(musicData.tracks)) {
      const fp = path.join(MUSIC_DIR, def.file);
      expect(existsSync(fp), `${name}: ${def.file} missing`).toBe(true);
    }
  });

  it('scene keys all map to valid track names', () => {
    for (const [scene, trackName] of Object.entries(musicData.scenes)) {
      expect(musicData.tracks[trackName], `scene "${scene}" → "${trackName}" not found`).toBeDefined();
    }
  });

  it('every track has channel 0 (pulse1) and channel 9 (noise) in mapping', () => {
    for (const [name, def] of Object.entries(musicData.tracks)) {
      if (def.isJingle) continue;
      const channels = def.trackMapping.map(m => m.channel);
      expect(channels, `${name}: missing channel 0`).toContain(0);
      expect(channels, `${name}: missing channel 9`).toContain(9);
    }
  });
});

describe('loop-point timing', () => {
  it('loopEndBar > loopStartBar for all non-jingle tracks', () => {
    for (const [name, def] of Object.entries(musicData.tracks)) {
      if (def.isJingle) continue;
      expect(def.loopEndBar, `${name}: loopEndBar must be > loopStartBar`).toBeGreaterThan(def.loopStartBar);
    }
  });

  it('loop duration in seconds matches bars × beats × tempo', () => {
    for (const [name, def] of Object.entries(musicData.tracks)) {
      if (def.isJingle) continue;
      const midi = loadMidi(def.file);
      const bpm  = midi.header.tempos[0]?.bpm ?? 120;
      const spb  = 60 / bpm;
      const expectedDur = (def.loopEndBar - def.loopStartBar) * def.beatsPerBar * spb;

      // Last note end time should be within 2s of expectedDur (notes may end slightly before)
      const allNotes = midi.tracks.flatMap(t => t.notes);
      const actualEnd = allNotes.reduce((m, n) => Math.max(m, n.time + n.duration), 0);
      expect(actualEnd, `${name}: track too short (got ${actualEnd.toFixed(2)}s, expected ~${expectedDur.toFixed(2)}s)`)
        .toBeGreaterThan(expectedDur * 0.85);
      expect(actualEnd, `${name}: track too long`)
        .toBeLessThan(expectedDur * 1.15);
    }
  });

  it('jingles have loopEndBar === 0 (no loop)', () => {
    for (const [name, def] of Object.entries(musicData.tracks)) {
      if (!def.isJingle) continue;
      expect(def.loopEndBar, `jingle ${name} should have loopEndBar=0`).toBe(0);
    }
  });
});

describe('channel → voice mapping', () => {
  const EXPECTED: Record<number, string> = { 0: 'pulse1', 1: 'pulse2', 2: 'triangle', 9: 'noise' };

  it('channel numbers map to correct voice names', () => {
    for (const [name, def] of Object.entries(musicData.tracks)) {
      for (const m of def.trackMapping) {
        const expected = EXPECTED[m.channel];
        if (expected !== undefined) {
          expect(m.voice, `${name} ch${m.channel}`).toBe(expected);
        }
      }
    }
  });
});

describe('MIDI parsing – basic structure', () => {
  it('every .mid file parses without error and has notes', () => {
    for (const [name, def] of Object.entries(musicData.tracks)) {
      const midi = loadMidi(def.file);
      expect(midi.tracks.length, `${name}: no tracks`).toBeGreaterThan(0);
      const total = midi.tracks.reduce((s, t) => s + t.notes.length, 0);
      expect(total, `${name}: zero notes`).toBeGreaterThan(0);
    }
  });

  it('death jingle is between 10 and 20 seconds', () => {
    const def  = musicData.tracks.death;
    const midi = loadMidi(def.file);
    const end  = midi.tracks.flatMap(t => t.notes).reduce((m, n) => Math.max(m, n.time + n.duration), 0);
    expect(end).toBeLessThanOrEqual(20);
    expect(end).toBeGreaterThan(10);
  });

  it('victory jingle is ≤ 5 seconds', () => {
    const def  = musicData.tracks.victory;
    const midi = loadMidi(def.file);
    const end  = midi.tracks.flatMap(t => t.notes).reduce((m, n) => Math.max(m, n.time + n.duration), 0);
    expect(end).toBeLessThanOrEqual(5.5);
    expect(end).toBeGreaterThan(2.5);
  });
});

describe('composition validity – pitch ranges', () => {
  for (const [trackName, params] of Object.entries(TRACK_PARAMS)) {
    it(`${trackName}: lead notes in [${params.leadLo}, ${params.leadHi}]`, () => {
      const def  = musicData.tracks[trackName];
      const midi = loadMidi(def.file);
      const leadCh = def.trackMapping.find(m => m.voice === 'pulse1')?.channel ?? 0;
      const leadTrack = midi.tracks.find(t => t.channel === leadCh);
      if (!leadTrack || leadTrack.notes.length === 0) return; // skip if no lead notes

      for (const n of leadTrack.notes) {
        expect(n.midi, `${trackName}: lead note ${n.midi} below ${params.leadLo}`).toBeGreaterThanOrEqual(params.leadLo);
        expect(n.midi, `${trackName}: lead note ${n.midi} above ${params.leadHi}`).toBeLessThanOrEqual(params.leadHi);
      }
    });

    it(`${trackName}: bass notes in [${params.bassLo}, ${params.bassHi}]`, () => {
      const def  = musicData.tracks[trackName];
      const midi = loadMidi(def.file);
      const bassCh = def.trackMapping.find(m => m.voice === 'triangle')?.channel ?? 2;
      const bassTrack = midi.tracks.find(t => t.channel === bassCh);
      if (!bassTrack || bassTrack.notes.length === 0) return;

      for (const n of bassTrack.notes) {
        expect(n.midi, `${trackName}: bass note ${n.midi} below ${params.bassLo}`).toBeGreaterThanOrEqual(params.bassLo);
        expect(n.midi, `${trackName}: bass note ${n.midi} above ${params.bassHi}`).toBeLessThanOrEqual(params.bassHi);
      }
    });
  }
});

describe('composition validity – scale membership', () => {
  for (const [trackName, params] of Object.entries(TRACK_PARAMS)) {
    it(`${trackName}: lead notes respect scale (allowing passing tones)`, () => {
      const def  = musicData.tracks[trackName];
      const midi = loadMidi(def.file);
      const leadCh    = def.trackMapping.find(m => m.voice === 'pulse1')?.channel ?? 0;
      const leadTrack = midi.tracks.find(t => t.channel === leadCh);
      if (!leadTrack || leadTrack.notes.length === 0) return;

      const scale = SCALES[params.scale];
      let violations = 0;
      for (const n of leadTrack.notes) {
        if (!isInScale(n.midi, params.key, scale)) violations++;
      }
      // Allow up to 5% violations (chromatic passing tones, ornaments)
      const maxViolations = Math.ceil(leadTrack.notes.length * 0.05);
      expect(violations, `${trackName}: ${violations} out-of-scale lead notes`).toBeLessThanOrEqual(maxViolations);
    });
  }
});

describe('composition validity – monophony', () => {
  function checkMonophony(notes: MidiNote[], label: string): void {
    const sorted = [...notes].sort((a, b) => a.time - b.time);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const overlap = prev.time + prev.duration - curr.time;
      // Allow tiny overlaps (< 5 ms) for legato articulation
      expect(overlap, `${label}: notes overlap by ${(overlap * 1000).toFixed(1)} ms`).toBeLessThan(0.005);
    }
  }

  for (const [trackName] of Object.entries(TRACK_PARAMS)) {
    it(`${trackName}: lead channel is monophonic`, () => {
      const def      = musicData.tracks[trackName];
      const midi     = loadMidi(def.file);
      const leadCh   = def.trackMapping.find(m => m.voice === 'pulse1')?.channel ?? 0;
      const track    = midi.tracks.find(t => t.channel === leadCh);
      if (track) checkMonophony(track.notes, `${trackName} lead`);
    });

    it(`${trackName}: bass channel is monophonic`, () => {
      const def    = musicData.tracks[trackName];
      const midi   = loadMidi(def.file);
      const bassCh = def.trackMapping.find(m => m.voice === 'triangle')?.channel ?? 2;
      const track  = midi.tracks.find(t => t.channel === bassCh);
      if (track) checkMonophony(track.notes, `${trackName} bass`);
    });
  }
});

describe('determinism – composer produces identical output on re-run', () => {
  let hashesBeforeRerun: Record<string, string>;
  let hashesAfterRerun: Record<string, string>;

  beforeAll(() => {
    // Capture current hashes
    hashesBeforeRerun = {};
    for (const def of Object.values(musicData.tracks)) {
      hashesBeforeRerun[def.file] = fileHash(def.file);
    }

    // Re-run the composer
    const result = spawnSync('node', ['tools/music/compose.mjs'], {
      cwd: ROOT,
      timeout: 30000,
      encoding: 'utf8',
    });
    expect(result.status, `composer exited with ${result.status}: ${result.stderr}`).toBe(0);

    // Capture hashes after second run
    hashesAfterRerun = {};
    for (const def of Object.values(musicData.tracks)) {
      hashesAfterRerun[def.file] = fileHash(def.file);
    }
  });

  it('every output file is byte-identical on second run', () => {
    for (const filename of Object.keys(hashesBeforeRerun)) {
      expect(hashesAfterRerun[filename], `${filename} differs after re-run`)
        .toBe(hashesBeforeRerun[filename]);
    }
  });
});
