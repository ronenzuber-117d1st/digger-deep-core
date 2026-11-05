import { GameEvent } from '../core/events';
import { getAudioContext } from './midi-player';

let sfxVol = 0.35;

export function setSfxVolume(v: number): void {
  sfxVol = Math.max(0, Math.min(1, v));
}

export function processSfxEvents(events: GameEvent[]): void {
  for (const ev of events) {
    try {
      switch (ev.type) {
        case 'pickup':
          if (ev.kind === 'nugget') sfxNugget();
          else if (ev.kind === 'gem') sfxGem();
          break;
        case 'bag-fall':
          sfxBagFall();
          break;
        case 'hit':
          sfxPlayerHurt();
          break;
        case 'kill':
          if (ev.kind === 'burrower') sfxBurrowerKill();
          else sfxEnemyKill();
          break;
      }
    } catch { /* swallow audio errors silently */ }
  }
}

// ── Noise buffer cache (one per AudioContext) ─────────────────────────────────

const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

function getNoiseBuffer(ac: AudioContext): AudioBuffer {
  let buf = noiseCache.get(ac);
  if (!buf) {
    const len = Math.ceil(ac.sampleRate * 0.5);
    buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic-ish LFSR noise for consistent character
    let state = 0x7fff;
    for (let i = 0; i < len; i++) {
      const bit = (state ^ (state >> 1)) & 1;
      state = (state >> 1) | (bit << 14);
      data[i] = (state / 0x4000) - 1;
    }
    noiseCache.set(ac, buf);
  }
  return buf;
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

function pulseNote(ac: AudioContext, freq: number, t0: number, dur: number, vol: number): void {
  const osc = ac.createOscillator();
  const g   = ac.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
  g.gain.setValueAtTime(vol, t0 + dur - 0.008);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
}

function noiseBurst(ac: AudioContext, t0: number, dur: number, freqHi: number, freqLo: number, vol: number): void {
  const src  = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);

  const filt = ac.createBiquadFilter();
  filt.type  = 'bandpass';
  filt.frequency.setValueAtTime(freqHi, t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(freqLo, 20), t0 + dur);
  filt.Q.value = 1.2;

  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

  src.connect(filt);
  filt.connect(g);
  g.connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.01);
}

// ── Sound effects ─────────────────────────────────────────────────────────────

function sfxNugget(): void {
  const ac = getAudioContext();
  const t  = ac.currentTime;
  const v  = sfxVol * 0.28;
  pulseNote(ac, 523, t,        0.055, v);  // C5
  pulseNote(ac, 660, t + 0.06, 0.080, v);  // E5
}

function sfxGem(): void {
  const ac = getAudioContext();
  const t  = ac.currentTime;
  const v  = sfxVol * 0.25;
  pulseNote(ac, 784,  t,        0.045, v);  // G5
  pulseNote(ac, 988,  t + 0.05, 0.055, v);  // B5
  pulseNote(ac, 1319, t + 0.11, 0.130, v);  // E6
}

function sfxBagFall(): void {
  const ac  = getAudioContext();
  const t   = ac.currentTime;
  const dur = 0.16;
  const osc = ac.createOscillator();
  const g   = ac.createGain();
  osc.type  = 'triangle';
  osc.frequency.setValueAtTime(210, t);
  osc.frequency.exponentialRampToValueAtTime(52, t + dur);
  g.gain.setValueAtTime(sfxVol * 0.50, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function sfxEnemyKill(): void {
  const ac = getAudioContext();
  noiseBurst(ac, ac.currentTime, 0.18, 650, 90, sfxVol * 0.42);
}

function sfxBurrowerKill(): void {
  const ac  = getAudioContext();
  const t   = ac.currentTime;
  const dur = 0.26;
  const osc = ac.createOscillator();
  const g   = ac.createGain();
  osc.type  = 'square';
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.exponentialRampToValueAtTime(62, t + dur);
  g.gain.setValueAtTime(sfxVol * 0.33, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function sfxPlayerHurt(): void {
  const ac = getAudioContext();
  const t  = ac.currentTime;
  // Short noise impact
  noiseBurst(ac, t, 0.12, 400, 100, sfxVol * 0.45);
  // Pitch-drop "clunk"
  const osc = ac.createOscillator();
  const g   = ac.createGain();
  osc.type  = 'square';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
  g.gain.setValueAtTime(sfxVol * 0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.11);
}

export function sfxPlayerDeath(): void {
  try {
    const ac  = getAudioContext();
    const t   = ac.currentTime + 0.005;
    const vol = Math.max(sfxVol, 0.1);  // ensure non-zero for exponential ramps

    // Three descending blips — classic NES death sting, all in audible range
    const freqs = [440, 330, 220];
    for (let i = 0; i < freqs.length; i++) {
      const t0  = t + i * 0.10;
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.type  = 'square';
      osc.frequency.setValueAtTime(freqs[i], t0);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.5, t0 + 0.09);
      g.gain.setValueAtTime(vol * 0.75, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + 0.10);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
    }
  } catch (err) {
    console.error('[sfx] death sound error:', err);
  }
}
