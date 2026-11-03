/**
 * MIDI-based music player.
 *
 * Parses .mid files (via @tonejs/midi), schedules note events through
 * NESChiptune for full NES-style audio, or falls back to the legacy
 * procedural engine depending on engineMode.
 *
 * Exposed API mirrors the old music.ts API so scenes need minimal changes:
 *   playTrack(name)  / stopTrack(fade?)  / playJingle(name)
 *   setMusicVolume(v) / setMuted(b)
 *   engineMode: 'chiptune' | 'dry' | 'procedural'
 */

// @tonejs/midi ships as CJS; Vite handles the interop for browser bundles.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { Midi } from '@tonejs/midi';

import { NESChiptune, VoiceName, VoiceConfig, MixConfig } from './chiptune';
import musicDataRaw from '../data/music.json';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackMapping { channel: number; voice: string }

interface TrackDef {
  file:         string;
  loopStartBar: number;
  loopEndBar:   number;
  beatsPerBar:  number;
  isJingle?:    boolean;
  trackMapping: TrackMapping[];
  voices:       Record<string, unknown>;
  mix:          Record<string, unknown>;
}

interface MusicDataShape {
  scenes: Record<string, string>;
  tracks: Record<string, TrackDef>;
}

const musicData = musicDataRaw as unknown as MusicDataShape;

interface ProcessedNote {
  channel:  number;
  midi:     number;
  relTime:  number;    // seconds from loopStart
  duration: number;
  velocity: number;
}

interface LoadedTrack {
  name:         string;
  loopNotes:    ProcessedNote[];
  loopDuration: number;    // 0 for jingles
  isJingle:     boolean;
  voices:       Record<VoiceName, VoiceConfig>;
  mix:          MixConfig;
  channelToVoice: Map<number, VoiceName>;
}

export type EngineMode = 'chiptune' | 'dry' | 'procedural';

// ── Module-level state ────────────────────────────────────────────────────────

let actx:    AudioContext | null = null;
let chip:    NESChiptune  | null = null;
let current: LoadedTrack  | null = null;
let jingleTrack: LoadedTrack | null = null;  // playing jingle

let isPlaying     = false;
let playStartAudio = 0;
let loopIteration  = 0;
let notePtr        = 0;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let jingleTimer:    ReturnType<typeof setInterval> | null = null;

let engineMode: EngineMode = 'chiptune';
let musicVolume = 0.5;
let muted       = false;

const trackCache = new Map<string, LoadedTrack>();

const LOOKAHEAD  = 0.30;   // seconds to schedule ahead
const SCHED_RATE = 100;    // ms between scheduler ticks

// ── AudioContext ───────────────────────────────────────────────────────────────

function getCtx(): AudioContext {
  if (!actx) {
    actx = new AudioContext();
    document.addEventListener('visibilitychange', () => {
      if (!actx) return;
      if (document.hidden) actx.suspend().catch(() => undefined);
      else                  actx.resume().catch(() => undefined);
    });
  }
  if (actx.state === 'suspended') actx.resume().catch(() => undefined);
  return actx;
}

function getChip(): NESChiptune {
  if (!chip) chip = new NESChiptune(getCtx());
  return chip;
}

// ── MIDI loading ──────────────────────────────────────────────────────────────

async function loadTrack(trackName: string): Promise<LoadedTrack | null> {
  if (trackCache.has(trackName)) return trackCache.get(trackName)!;

  const def = musicData.tracks[trackName];
  if (!def) { console.warn(`[music] unknown track: ${trackName}`); return null; }

  try {
    const resp = await fetch(`/assets/music/${def.file}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf  = await resp.arrayBuffer();
    const midi = new Midi(new Uint8Array(buf));

    const bpm   = midi.header.tempos[0]?.bpm ?? 120;
    const spb   = 60 / bpm;
    const lsb   = def.loopStartBar;
    const leb   = def.loopEndBar;
    const loopStartSec = lsb * def.beatsPerBar * spb;
    const loopEndSec   = def.isJingle ? Number.MAX_VALUE
                       : leb * def.beatsPerBar * spb;
    const loopDuration = def.isJingle ? 0 : loopEndSec - loopStartSec;

    const channelToVoice = new Map<number, VoiceName>();
    for (const m of def.trackMapping) {
      channelToVoice.set(m.channel, m.voice as VoiceName);
    }

    const loopNotes: ProcessedNote[] = [];
    for (const t of midi.tracks) {
      const voice = channelToVoice.get(t.channel);
      if (!voice) continue;
      for (const n of t.notes) {
        if (!def.isJingle && (n.time < loopStartSec || n.time >= loopEndSec)) continue;
        loopNotes.push({
          channel:  t.channel,
          midi:     n.midi,
          relTime:  n.time - loopStartSec,
          duration: n.duration,
          velocity: n.velocity,
        });
      }
    }
    loopNotes.sort((a, b) => a.relTime - b.relTime);

    const loaded: LoadedTrack = {
      name: trackName,
      loopNotes,
      loopDuration,
      isJingle:    def.isJingle ?? false,
      voices:      def.voices as unknown as Record<VoiceName, VoiceConfig>,
      mix:         def.mix    as unknown as MixConfig,
      channelToVoice,
    };

    if (!def.isJingle) trackCache.set(trackName, loaded);
    return loaded;
  } catch (err) {
    console.warn(`[music] load failed for ${trackName}:`, err);
    return null;
  }
}

// ── Pre-load all tracks in background ────────────────────────────────────────

export async function preloadAllTracks(): Promise<void> {
  const names = Object.keys(musicData.tracks);
  await Promise.all(names.map(loadTrack));
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function dispatchNote(note: ProcessedNote, audioTime: number, track: LoadedTrack): void {
  const c   = getChip();
  const voice = track.channelToVoice.get(note.channel);
  if (!voice) return;

  if (engineMode === 'dry') {
    // Plain square wave for every pitched voice, skip drums
    if (voice === 'noise') return;
    if (voice === 'triangle') {
      c.scheduleTriangleNote(note.midi, audioTime, note.duration, note.velocity);
    } else {
      c.schedulePulseNote(voice, note.midi, audioTime, note.duration, note.velocity);
    }
    return;
  }

  // Full chiptune chain
  if (voice === 'noise')    { c.scheduleDrum(note.midi, audioTime, note.velocity); return; }
  if (voice === 'triangle') { c.scheduleTriangleNote(note.midi, audioTime, note.duration, note.velocity); return; }
  c.schedulePulseNote(voice, note.midi, audioTime, note.duration, note.velocity);
}

function runScheduler(): void {
  if (!actx) return;

  // --- looping track ---
  if (isPlaying && current) {
    const now   = actx.currentTime;
    const until = now + LOOKAHEAD;
    const track = current;

    while (true) {
      const note = track.loopNotes[notePtr % track.loopNotes.length];
      const at   = playStartAudio + note.relTime + loopIteration * track.loopDuration;
      if (at > until) break;
      if (!muted) dispatchNote(note, at, track);
      notePtr++;
      if (notePtr >= track.loopNotes.length) { notePtr = 0; loopIteration++; }
    }
  }

  // --- one-shot jingle ---
  if (jingleTrack) {
    const now   = actx.currentTime;
    const until = now + LOOKAHEAD;
    const jt    = jingleTrack;

    while (notePtr < jt.loopNotes.length) {
      const note = jt.loopNotes[notePtr];
      const at   = playStartAudio + note.relTime;
      if (at > until) break;
      if (!muted) dispatchNote(note, at, jt);
      notePtr++;
    }
    // Jingle finished scheduling?  Mark done (let notes play out naturally)
    if (notePtr >= jt.loopNotes.length) jingleTrack = null;
  }
}

function startScheduler(): void {
  if (schedulerTimer !== null) return;
  schedulerTimer = setInterval(runScheduler, SCHED_RATE);
}

function stopScheduler(): void {
  if (schedulerTimer !== null) { clearInterval(schedulerTimer); schedulerTimer = null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call after the first user gesture to warm up AudioContext. */
export function ensureAudioContext(): void {
  try { getCtx(); } catch {}
}

/** Play a looping track (loads if necessary).  No-op if already playing the same track. */
export async function playTrack(name: string, fadeInSec = 0.3): Promise<void> {
  if (engineMode === 'procedural') return;  // handled by old music.ts
  if (current?.name === name && isPlaying) return;
  try {
    stopTrack(0.15);
    const track = await loadTrack(name);
    if (!track) return;

    const ctx = getCtx();
    const c   = getChip();
    c.configure(track.mix, track.voices);
    if (!muted) c.fadeIn(musicVolume, fadeInSec);
    else        c.setMasterVolume(0);

    current       = track;
    isPlaying     = true;
    notePtr       = 0;
    loopIteration = 0;
    playStartAudio = ctx.currentTime + 0.05;  // small startup gap

    runScheduler();  // fill initial buffer immediately
    startScheduler();
  } catch (err) {
    console.warn('[music] playTrack error:', err);
  }
}

/** Stop the current looping track. */
export function stopTrack(fadeOutSec = 0.4): void {
  if (!isPlaying) return;
  isPlaying = false;
  stopScheduler();
  current = null;
  try { getChip().fadeOut(fadeOutSec); } catch {}
}

/** Play a one-shot jingle (death / victory).  Interrupts any running jingle. */
export async function playJingle(name: string): Promise<void> {
  if (engineMode === 'procedural') return;
  try {
    jingleTrack = null;
    if (jingleTimer !== null) { clearInterval(jingleTimer); jingleTimer = null; }

    const track = await loadTrack(name);
    if (!track || !track.isJingle) return;

    const ctx = getCtx();
    getChip();  // ensure chip exists

    jingleTrack    = track;
    notePtr        = 0;
    playStartAudio = ctx.currentTime + 0.02;

    runScheduler();
    startScheduler();
  } catch (err) {
    console.warn('[music] playJingle error:', err);
  }
}

export function setMusicVolume(v: number): void {
  musicVolume = Math.max(0, Math.min(1, v));
  try { if (!muted) getChip().setMasterVolume(musicVolume); } catch {}
}

export function getMusicVolume(): number { return musicVolume; }

export function setMuted(on: boolean): void {
  muted = on;
  try { getChip().setMasterVolume(on ? 0 : musicVolume); } catch {}
}

export function isMuted(): boolean { return muted; }

export function setEngineMode(mode: EngineMode): void {
  engineMode = mode;
  if (mode !== 'procedural') {
    // Force restart current track through new mode
    const was = current?.name;
    stopTrack(0);
    if (was) void playTrack(was);
  }
}

export function getEngineMode(): EngineMode { return engineMode; }

export function setDelayLevel(level: number): void {
  try { getChip().setDelayLevel(level); } catch {}
}

/** Current playback position info (for debug panel). */
export function getLoopInfo(): { startSec: number; endSec: number; positionSec: number; trackName: string } {
  if (!current || !actx) return { startSec: 0, endSec: 0, positionSec: 0, trackName: '' };
  const elapsed   = actx.currentTime - playStartAudio;
  const pos       = current.loopDuration > 0
    ? (elapsed % current.loopDuration)
    : elapsed;
  return {
    startSec:  0,
    endSec:    current.loopDuration,
    positionSec: Math.max(0, pos),
    trackName: current.name,
  };
}

export function getAvailableTrackNames(): string[] {
  return Object.keys(musicData.tracks);
}

export function getSceneTrack(sceneBiomeKey: string): string | null {
  return (musicData.scenes as Record<string, string>)[sceneBiomeKey] ?? null;
}
