// Re-export the new MIDI-based player and the legacy procedural engine.
// Scenes import from here so the internal engine is a single switch point.

export type { EngineMode } from './midi-player';
export {
  playTrack,
  stopTrack,
  playJingle,
  setMusicVolume,
  getMusicVolume,
  setMuted,
  isMuted,
  setEngineMode,
  getEngineMode,
  setDelayLevel,
  getLoopInfo,
  getAvailableTrackNames,
  getSceneTrack,
  preloadAllTracks,
  ensureAudioContext,
} from './midi-player';

// Legacy engine still reachable for comparison / procedural mode
export { playMusic, stopMusic, DIVE_THEME, TITLE_THEME, DEATH_JINGLE } from './music';
