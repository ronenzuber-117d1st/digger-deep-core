type Note = { freq: number; dur: number };

// ── Engine ────────────────────────────────────────────────────────────────

let actx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let track: Note[] = [];
let noteIdx = 0;
let running = false;
let masterVol = 0.1;

function getCtx(): AudioContext {
  if (!actx) actx = new AudioContext();
  return actx;
}

function advance(): void {
  if (!running || !osc || !gainNode) return;
  if (oneShot && noteIdx >= track.length) { stopMusic(); return; }
  const note = track[noteIdx % track.length];
  noteIdx++;

  const ctx = getCtx();
  const now = ctx.currentTime;
  const gap = Math.min(0.025, note.dur * 0.12);

  gainNode.gain.cancelScheduledValues(now);
  if (note.freq > 0) {
    osc.frequency.setValueAtTime(note.freq, now);
    gainNode.gain.setValueAtTime(masterVol, now);
    gainNode.gain.setValueAtTime(0, now + note.dur - gap);
  } else {
    gainNode.gain.setValueAtTime(0, now);
  }

  timer = setTimeout(advance, note.dur * 1000);
}

let oneShot = false;

export function playJingle(t: Note[], volume = 0.12): void {
  stopMusic();
  track = t;
  noteIdx = 0;
  masterVol = volume;
  running = true;
  oneShot = true;

  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();

  gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.connect(ctx.destination);

  osc = ctx.createOscillator();
  osc.type = 'square';
  osc.connect(gainNode);
  osc.start();

  advance();
}

export function playMusic(t: Note[], volume = 0.1): void {
  oneShot = false;
  stopMusic();
  track = t;
  noteIdx = 0;
  masterVol = volume;
  running = true;

  const ctx = getCtx();
  // Resume suspended context (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();

  gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.connect(ctx.destination);

  osc = ctx.createOscillator();
  osc.type = 'square';
  osc.connect(gainNode);
  osc.start();

  advance();
}

export function stopMusic(): void {
  running = false;
  if (timer)    { clearTimeout(timer); timer = null; }
  if (osc)      { try { osc.stop(); } catch {} osc.disconnect(); osc = null; }
  if (gainNode) { gainNode.disconnect(); gainNode = null; }
}

// ── Note helpers ──────────────────────────────────────────────────────────

function n(freq: number, dur: number): Note { return { freq, dur }; }
function r(dur: number): Note               { return { freq: 0, dur }; }

// Frequencies
const D3=146.83, E3=164.81, F3=174.61, G3=196.00, A3=220.00, Bb3=233.08;
const C4=261.63, D4=293.66, E4=329.63, F4=349.23, G4=392.00, A4=440.00, Bb4=466.16;

// ── Dive theme: D minor, 120 BPM, underground ────────────────────────────

const q=0.50, e=0.25, h=1.00, s=0.125;

export const DIVE_THEME: Note[] = [
  // Phrase A — descending minor run
  n(A4,e), n(G4,e), n(F4,e), n(E4,e),
  n(D4,q), r(e),    n(A3,e),
  n(Bb3,e), n(A3,e), n(G3,e), n(F3,e),
  n(E3,q), r(q),
  // Phrase A (lower register)
  n(A3,e), n(G3,e), n(F3,e), n(E3,e),
  n(D3,q), r(e),    n(A3,e),
  n(G3,e), n(F3,e), n(E3,e), n(D3,e),
  n(A3,h),
  // Phrase B — rising tension
  n(D4,e), n(E4,e), n(F4,e), n(G4,e),
  n(A4,q), r(e),    n(A4,s), n(Bb4,s),
  n(A4,e), n(G4,e), n(F4,e), n(E4,e),
  n(D4,q), r(q),
  // Return — walk back down to rest
  n(F4,e), n(E4,e), n(D4,e), n(C4,e),
  n(Bb3,e), n(A3,e), n(G3,e), n(F3,e),
  n(E3,e), n(G3,e), n(A3,e), n(C4,e),
  n(D4,h), r(q),
];

// ── Death jingle: descending chromatic, one-shot ─────────────────────────

const C5=523.25, B4=493.88, Bb4j=466.16, A4j=440.00, Ab4=415.30, G4j=392.00;

export const DEATH_JINGLE: Note[] = [
  r(e),
  n(C5,  q),
  n(B4,  q),
  n(Bb4j, q),
  n(A4j,  q),
  n(Ab4, q),
  n(G4j,  h),
  r(e),
];

// ── Title theme: A minor, 150 BPM, adventurous ───────────────────────────

const qt=0.40, et=0.20, ht=0.80;

const B3=246.94, C4t=261.63, D4t=293.66, E4t=329.63, F4t=349.23, G4t=392.00, A4t=440.00;
const A3t=220.00, G3t=196.00;

export const TITLE_THEME: Note[] = [
  // Phrase A — upward leap then step down
  n(A4t,et), n(G4t,et), n(E4t,et), n(C4t,et),
  n(D4t,qt), n(E4t,et), n(F4t,et),
  n(E4t,qt), n(C4t,et), n(A3t,et),
  n(A3t,ht),
  // Phrase B — climb back up
  n(F4t,et), n(E4t,et), n(D4t,et), n(C4t,et),
  n(B3, qt), n(G3t,et), n(B3, et),
  n(C4t,qt), n(E4t,et), n(G4t,et),
  n(A4t,ht), r(qt),
];
