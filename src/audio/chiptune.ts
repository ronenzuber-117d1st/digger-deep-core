/**
 * NES/Game-Boy-style voice engine built on Web Audio API.
 *
 * Voices:
 *   pulse1   – lead, Pulse wave (selectable duty), delay + left pan
 *   pulse2   – harmony, Pulse wave, right pan
 *   triangle – bass, soft triangle
 *   noise    – drums, filtered white noise
 *
 * Mix chain: voiceGain → stereoPanner → [delay] → masterBus → lowPass → limiter → destination
 */

export type VoiceName = 'pulse1' | 'pulse2' | 'triangle' | 'noise';

export type DutyCycle = 0.125 | 0.25 | 0.5;

export interface ADSRConfig {
  attack:  number;   // seconds
  decay:   number;   // seconds
  sustain: number;   // 0–1 (relative to peak)
  release: number;   // seconds
}

export interface VibratoConfig {
  depth: number;   // Hz deviation from centre
  rate:  number;   // LFO Hz
  delay: number;   // seconds before vibrato fades in
}

export interface VoiceConfig {
  duty?:   DutyCycle;      // pulse voices only
  adsr:    ADSRConfig;
  vibrato?: VibratoConfig;
  volume:  number;         // 0–1
}

export interface MixConfig {
  delay: {
    time:     number;  // seconds  (150–250 ms recommended)
    feedback: number;  // 0–1
    level:    number;  // wet mix 0–1
    enabled:  boolean;
  };
  panning:       { p1: number; p2: number };  // –1..1
  masterLowPass: number;  // Hz
  masterVolume:  number;  // 0–1
}

// ── Waveform cache ────────────────────────────────────────────────────────────

const pulseWaveCache = new Map<string, PeriodicWave>();

/** Build a pulse PeriodicWave for the given duty cycle (Fourier series). */
function getPulseWave(ctx: AudioContext, duty: DutyCycle): PeriodicWave {
  const key = `${ctx.sampleRate}-${duty}`;
  if (pulseWaveCache.has(key)) return pulseWaveCache.get(key)!;

  const N    = 64;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    const a = 2 * Math.PI * n * duty;
    real[n] = (2 / (n * Math.PI)) * Math.sin(a);
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(a));
  }
  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  pulseWaveCache.set(key, wave);
  return wave;
}

// ── Noise buffer ──────────────────────────────────────────────────────────────

const NOISE_SECONDS = 1.0;
let cachedNoiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const len = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic-ish pink-ish noise (not seeded, that's fine for drums)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  cachedNoiseBuffer = buf;
  return buf;
}

// ── MIDI → Hz ─────────────────────────────────────────────────────────────────

function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// ── Main chiptune class ───────────────────────────────────────────────────────

export class NESChiptune {
  private ctx: AudioContext;

  // Master bus
  private masterGain:    GainNode;
  private masterLowPass: BiquadFilterNode;
  private masterLimiter: DynamicsCompressorNode;

  // Per-voice buses (all feed masterGain)
  private p1Bus:    GainNode;
  private p2Bus:    GainNode;
  private triBus:   GainNode;
  private noiseBus: GainNode;

  // Stereo panners
  private p1Pan:  StereoPannerNode;
  private p2Pan:  StereoPannerNode;

  // Delay (pulse1 only)
  private delayNode:     DelayNode;
  private delayFeedback: GainNode;
  private delayWet:      GainNode;

  // Current voice configs (for scheduling)
  voiceConfigs: Record<VoiceName, VoiceConfig> = {
    pulse1:   { duty: 0.25, adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.05 }, volume: 0.7 },
    pulse2:   { duty: 0.25, adsr: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.05 }, volume: 0.4 },
    triangle: {             adsr: { attack: 0.005, decay: 0.04, sustain: 0.9, release: 0.03 }, volume: 0.55 },
    noise:    {             adsr: { attack: 0.001, decay: 0.06, sustain: 0.0, release: 0.02 }, volume: 0.28 },
  };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // ── Limiter ───────────────────────────────────────────────────────────────
    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -2;
    this.masterLimiter.knee.value      = 3;
    this.masterLimiter.ratio.value     = 20;
    this.masterLimiter.attack.value    = 0.001;
    this.masterLimiter.release.value   = 0.08;
    this.masterLimiter.connect(ctx.destination);

    // ── Low-pass ──────────────────────────────────────────────────────────────
    this.masterLowPass = ctx.createBiquadFilter();
    this.masterLowPass.type            = 'lowpass';
    this.masterLowPass.frequency.value = 12000;
    this.masterLowPass.connect(this.masterLimiter);

    // ── Master gain ───────────────────────────────────────────────────────────
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.masterLowPass);

    // ── Delay (pulse1 only) ───────────────────────────────────────────────────
    this.delayNode     = ctx.createDelay(0.5);
    this.delayFeedback = ctx.createGain();
    this.delayWet      = ctx.createGain();
    this.delayNode.delayTime.value  = 0.20;
    this.delayFeedback.gain.value   = 0.25;
    this.delayWet.gain.value        = 0.15;

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.masterGain);

    // ── Per-voice buses ───────────────────────────────────────────────────────
    this.p1Bus    = ctx.createGain();
    this.p2Bus    = ctx.createGain();
    this.triBus   = ctx.createGain();
    this.noiseBus = ctx.createGain();

    this.p1Pan  = ctx.createStereoPanner();
    this.p2Pan  = ctx.createStereoPanner();
    this.p1Pan.pan.value  = -0.3;
    this.p2Pan.pan.value  =  0.3;

    // pulse1 → p1Pan → masterGain + delayNode
    this.p1Bus.connect(this.p1Pan);
    this.p1Pan.connect(this.masterGain);
    this.p1Pan.connect(this.delayNode);

    // pulse2 → p2Pan → masterGain
    this.p2Bus.connect(this.p2Pan);
    this.p2Pan.connect(this.masterGain);

    // tri + noise → masterGain directly (centred)
    this.triBus.connect(this.masterGain);
    this.noiseBus.connect(this.masterGain);
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  configure(mix: MixConfig, voices: Record<VoiceName, VoiceConfig>): void {
    this.voiceConfigs = voices;

    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(mix.masterVolume, now, 0.05);
    this.masterLowPass.frequency.setTargetAtTime(mix.masterLowPass, now, 0.1);

    this.p1Pan.pan.setTargetAtTime(mix.panning.p1, now, 0.05);
    this.p2Pan.pan.setTargetAtTime(mix.panning.p2, now, 0.05);

    this.delayNode.delayTime.setTargetAtTime(mix.delay.time, now, 0.05);
    this.delayFeedback.gain.setTargetAtTime(mix.delay.feedback, now, 0.05);
    this.delayWet.gain.setTargetAtTime(mix.delay.enabled ? mix.delay.level : 0, now, 0.05);

    this.p1Bus.gain.setTargetAtTime(voices.pulse1.volume, now, 0.05);
    this.p2Bus.gain.setTargetAtTime(voices.pulse2.volume, now, 0.05);
    this.triBus.gain.setTargetAtTime(voices.triangle.volume, now, 0.05);
    this.noiseBus.gain.setTargetAtTime(voices.noise.volume, now, 0.05);
  }

  setMasterVolume(v: number): void {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setDelayLevel(level: number): void {
    this.delayWet.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
  }

  setDelayEnabled(on: boolean): void {
    this.delayWet.gain.setTargetAtTime(on ? this.delayFeedback.gain.value : 0, this.ctx.currentTime, 0.05);
  }

  // ── Note scheduling ────────────────────────────────────────────────────────

  /**
   * Schedule a single note on pulse1 or pulse2.
   * Creates a fresh OscillatorNode per note (GC'd after stop).
   */
  schedulePulseNote(
    voice: 'pulse1' | 'pulse2',
    midiNote: number,
    t0: number,
    dur: number,
    velocity: number,
  ): void {
    try {
      const cfg  = this.voiceConfigs[voice];
      const duty = (cfg.duty ?? 0.25) as DutyCycle;
      const adsr = cfg.adsr;
      const bus  = voice === 'pulse1' ? this.p1Bus : this.p2Bus;
      const hz   = midiToHz(midiNote);

      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.setPeriodicWave(getPulseWave(this.ctx, duty));
      osc.frequency.setValueAtTime(hz, t0);
      osc.connect(gain);
      gain.connect(bus);

      this.applyADSR(gain.gain, t0, dur, adsr, velocity);

      if (cfg.vibrato) {
        this.applyVibrato(osc.frequency, hz, t0, dur, cfg.vibrato);
      }

      const stopTime = t0 + dur + adsr.release + 0.05;
      osc.start(t0);
      osc.stop(stopTime);
      // Disconnect after stop to free resources
      osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
    } catch {}
  }

  /**
   * Schedule a single note on the triangle (bass) voice.
   */
  scheduleTriangleNote(
    midiNote: number,
    t0: number,
    dur: number,
    velocity: number,
  ): void {
    try {
      const adsr = this.voiceConfigs.triangle.adsr;
      const hz   = midiToHz(midiNote);

      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz, t0);
      osc.connect(gain);
      gain.connect(this.triBus);

      this.applyADSR(gain.gain, t0, dur, adsr, velocity);

      const stopTime = t0 + dur + adsr.release + 0.05;
      osc.start(t0);
      osc.stop(stopTime);
      osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
    } catch {}
  }

  /**
   * Schedule a drum hit.  midiNote maps to GM drum layout.
   * 36 = kick, 38 = snare, 42 = closed hat, 46 = open hat.
   */
  scheduleDrum(midiNote: number, t0: number, velocity: number): void {
    try {
      switch (midiNote) {
        case 36: return this.scheduleKick(t0, velocity);
        case 38: return this.scheduleSnare(t0, velocity);
        case 42: return this.scheduleHat(t0, velocity, false);
        case 46: return this.scheduleHat(t0, velocity, true);
        default: return;
      }
    } catch {}
  }

  private scheduleKick(t0: number, vel: number): void {
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(35, t0 + 0.10);
    gain.gain.setValueAtTime(vel * 0.90, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    osc.connect(gain);
    gain.connect(this.noiseBus);
    osc.start(t0);
    osc.stop(t0 + 0.22);
    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
  }

  private scheduleSnare(t0: number, vel: number): void {
    const noiseCtx = this.ctx;
    const src    = noiseCtx.createBufferSource();
    const filter = noiseCtx.createBiquadFilter();
    const gain   = noiseCtx.createGain();

    src.buffer = getNoiseBuffer(noiseCtx);
    src.loop   = true;
    filter.type            = 'bandpass';
    filter.frequency.value = 2800;
    filter.Q.value         = 0.8;
    gain.gain.setValueAtTime(vel * 0.70, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.10);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.noiseBus);
    src.start(t0);
    src.stop(t0 + 0.12);
    src.onended = () => { try { src.disconnect(); filter.disconnect(); gain.disconnect(); } catch {} };
  }

  private scheduleHat(t0: number, vel: number, open: boolean): void {
    const src    = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain   = this.ctx.createGain();

    src.buffer = getNoiseBuffer(this.ctx);
    src.loop   = true;
    filter.type            = 'highpass';
    filter.frequency.value = 6500;
    filter.Q.value         = 1.5;

    const decay = open ? 0.12 : 0.030;
    gain.gain.setValueAtTime(vel * (open ? 0.55 : 0.40), t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + decay);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.noiseBus);
    src.start(t0);
    src.stop(t0 + decay + 0.01);
    src.onended = () => { try { src.disconnect(); filter.disconnect(); gain.disconnect(); } catch {} };
  }

  // ── Envelope ──────────────────────────────────────────────────────────────

  private applyADSR(
    param: AudioParam,
    t0: number,
    dur: number,
    adsr: ADSRConfig,
    velocity: number,
  ): void {
    const peak = velocity;
    const sus  = Math.max(peak * adsr.sustain, 0.0001);
    const tA   = t0 + adsr.attack;
    const tD   = tA + adsr.decay;
    const tR   = t0 + dur;

    param.cancelScheduledValues(t0 - 0.001);
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(peak, tA);
    param.exponentialRampToValueAtTime(sus, tD);
    param.setValueAtTime(sus, tR);
    param.exponentialRampToValueAtTime(0.0001, tR + adsr.release);
  }

  // ── Vibrato ───────────────────────────────────────────────────────────────

  private applyVibrato(
    freqParam: AudioParam,
    baseHz: number,
    t0: number,
    dur: number,
    vib: VibratoConfig,
  ): void {
    if (dur < vib.delay) return;

    const lfo     = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value  = vib.rate;
    lfoGain.gain.setValueAtTime(0, t0);
    lfoGain.gain.setValueAtTime(0, t0 + vib.delay);
    lfoGain.gain.linearRampToValueAtTime(vib.depth, t0 + vib.delay + 0.15);
    lfoGain.gain.setValueAtTime(vib.depth, t0 + dur - 0.05);
    lfoGain.gain.linearRampToValueAtTime(0, t0 + dur);

    lfo.connect(lfoGain);
    lfoGain.connect(freqParam);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
    lfo.onended = () => { try { lfo.disconnect(); lfoGain.disconnect(); } catch {} };
    void baseHz; // used implicitly via freqParam connection
  }

  // ── Fade helpers ──────────────────────────────────────────────────────────

  /** Fade master volume to 0 over `seconds`. */
  fadeOut(seconds: number): void {
    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + seconds);
  }

  fadeIn(targetVolume: number, seconds: number): void {
    const now = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(targetVolume, now + seconds);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    try {
      this.masterGain.disconnect();
      this.masterLowPass.disconnect();
      this.masterLimiter.disconnect();
    } catch {}
  }
}
