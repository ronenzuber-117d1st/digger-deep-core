# Deep Core – Music System Notes

## How to regenerate MIDI files

```
npm run music
```

This runs `tools/music/compose.mjs` deterministically. The output is byte-identical on every run (seeded RNG). Commit the resulting `.mid` files in `public/assets/music/`.

## How to add or replace a track

1. Add an entry to `TRACKS[]` in `tools/music/compose.mjs` with a unique `seed` value.
2. Add the track definition to `src/data/music.json` (voices, mix, loop points, trackMapping).
3. Add a scene mapping in `music.json` → `scenes` if the track should play automatically.
4. Run `npm run music` to emit the `.mid` file.
5. Run `npm test` to verify all music tests pass (loop timing, ranges, scale, monophony).

## Voice map (MIDI channel → NES voice)

| Channel | Voice    | NES analog     |
|---------|----------|----------------|
| 0       | pulse1   | Pulse 1 (lead) |
| 1       | pulse2   | Pulse 2 (harmony) |
| 2       | triangle | Triangle (bass) |
| 9       | noise    | Noise (drums)  |

Channel 9 is the General MIDI drum channel — standard DAWs play drum sounds on it automatically, so the MIDI files preview correctly in any DAW.

## Track reference

| Track key      | File              | BPM | Bars | Key  | Scale     | Mood / Use                          |
|----------------|-------------------|-----|------|------|-----------|-------------------------------------|
| title          | title.mid         | 100 | 16   | C4   | minor     | Melancholic intro, menu screen      |
| base           | base.mid          | 92  | 16   | G4   | major     | Calm, homely; Base Camp screen      |
| topsoil        | topsoil.mid       | 128 | 24   | D4   | major     | Bright, bouncy; floors 1–5          |
| fossilBed      | fossil-bed.mid    | 96  | 16   | A4   | minor     | Dusty, mysterious; floors 6–10      |
| crystalDepths  | crystal-depths.mid| 116 | 16   | E5   | lydian    | Shimmering, ethereal; floors 11–15  |
| fungalHollow   | fungal-hollow.mid | 132 | 24   | D4   | phrygian  | Tense, alien; floors 16–20          |
| magmaSeams     | magma-seams.mid   | 150 | 16   | E4   | minor     | Driving, aggressive; floors 21–25   |
| frozenVault    | frozen-vault.mid  | 105 | 16   | B4   | minor     | Cold, brooding; floors 26+          |
| death          | death.mid         | 90  | —    | —    | —         | Descending chromatic jingle (~2.5 s)|
| victory        | victory.mid       | 80  | —    | —    | —         | Ascending fanfare jingle (~2.8 s)   |

## Loop points

All non-jingle tracks loop between `loopStartBar` and `loopEndBar` (defined in `music.json`). Currently all tracks loop from bar 0 to the final bar (the whole track).

Jingles (`isJingle: true`) have `loopEndBar: 0` and play once.

## Composer structure

Each track is built from three sections:
- **A** (8 bars, `chordsA`): main theme
- **B** (8 bars, `chordsB`): contrasting section, sometimes with drum dropout
- **A′** (8 bars, `chordsA` + variation, 24-bar tracks only): return with modified ending

Harmony style options per track:

| Style       | Description                                      |
|-------------|--------------------------------------------------|
| counter     | Melody shifted down a 3rd in scale (pulse2)      |
| arpeggio    | Chord arpeggiation in sixteenth notes            |
| highArpeggio| Same as arpeggio but an octave higher            |
| ostinato    | Repeated fifth on each chord beat                |

## Tuning and originality note

The MIDI files are a generated first draft. They satisfy structural constraints (scale membership, pitch ranges, monophony, loop timing) but are intentionally simple. Use them as a starting point — replace any track with a hand-authored `.mid` file by dropping it into `public/assets/music/` and updating `music.json`. The `npm run music` command will overwrite any file whose name matches a composer-defined track, so rename hand-authored files if you want to protect them from regeneration.
