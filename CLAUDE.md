# Deep Core: project guide for Claude Code

A roguelite remake of the 1983 game Digger. Pixel art, browser first, solo project.
**Source of truth for rules and numbers:** `docs/deep-core-game-design.html`.
If the doc and the code disagree, ask before changing either. Tunable numbers live in `src/data/*.json`, never hardcoded.

## Stack

Phaser 3 · TypeScript (strict) · Vite · Vitest · ESLint + Prettier. Static hosting only (no backend, no database, no network calls in the game).

## Commands

- `npm run dev` : Vite dev server
- `npm run build` : production build to `dist/`
- `npm test` : Vitest (run before finishing any task that touches `core/`)
- `npm run lint`

## Architecture: client-only, three layers

Style: a single-page client app with a **pure logic core** and a thin Phaser layer. No backend because there is nothing to share between players. A backend would add cost, failure modes, and no value for v1.

```
src/
  core/        PURE TypeScript. No Phaser, no DOM, no Date.now(), no Math.random().
    grid.ts        tile grid, tile types, queries (isSolid, neighbours)
    rng.ts         seeded RNG (mulberry32), the ONLY source of randomness
    floorgen.ts    seeded floor generator (+ reachability guarantee)
    entities.ts    player, monsters, bags, nuggets, pickups, nests
    rules/         digging, fuel, bag physics, combat, monster AI, hazards
    run.ts         RunState: floor progression, picks, death/extraction
    economy.ts     costs, rewards, cost formula, death penalty
    save.ts        SaveData, versioned migrations (pure: takes/returns objects)
    step.ts        step(state, input, dt): the single fixed-timestep update (60 Hz)
  data/        JSON only: upgrades, monsters, biomes, dialogue, tuning
  render/      Phaser rendering. Reads state, draws it. Never mutates game state.
  scenes/      Boot, Title, Base, Dive, PickUpgrade, Summary, Pause
  input/       Action enum + keyboard mapping (touch and gamepad later)
  audio/       sfx and music wrappers, volume settings
  storage/     localStorage adapter (try/catch around every access)
  debug/       debug panel (dev only, tree-shaken from production)
tests/         Vitest, mirrors src/core
docs/          design doc, art bible, palette
public/assets/ sprites, tiles, audio (only palette-quantised art)
```

### Ownership rules (who owns what, and what they must NOT do)

| Layer | Owns | Must not |
|---|---|---|
| `core/` | all game state and rules | import Phaser/DOM, read the clock, call Math.random |
| `render/` | drawing, animation, particles, screen shake | change game state |
| `scenes/` | flow between screens, UI | contain game rules |
| `storage/` | reading and writing the save | be called from `core/` |
| `data/` | numbers and content | contain logic |

## Key flows

**Frame loop (Dive scene):**
1. Phaser `update(time, delta)` accumulates delta.
2. While accumulator ≥ 1/60 s: `state = step(state, inputSnapshot, 1/60)`.
3. `render/` draws the latest state (interpolation optional later).
4. Events produced by `step` (hit, pickup, bag-break, floor-clear) are returned as a list. `render/` and `audio/` consume them for effects and sounds.

**Dive lifecycle:** Base → `startRun(seed, save)` → `generateFloor(seed, floor)` → play → exit shaft → `nextFloor` → (every 2nd floor) pick screen → … → death or extraction → `settleRun(run, save)` returns the new SaveData → `storage.save()` → Summary → Base.

**Save flow:** `storage.load()` → parse → `migrate(save)` → validate → use. On parse failure or a missing key: create a fresh save and show a notice. Never crash. Save after every settled run and every purchase.

## Failure handling

- **Corrupt or old save:** the migration function brings it to the current version. Invalid data gets replaced with defaults, and the original is kept under a `deepcore.save.backup` key.
- **localStorage unavailable** (private mode, blocked): the game runs with an in-memory save and shows "progress will not be saved".
- **Asset load failure:** show an error scene with a Retry button and never a blank screen.
- **Tab hidden:** auto-pause, and clamp delta to avoid a huge catch-up step (max 100 ms).
- **Soft-lock prevention:** `floorgen` must guarantee the exit and at least one fuel canister are reachable by digging. Unit-test this over 1000 seeds.

## Conventions

- Determinism: the same seed plus the same inputs gives the same result. Do not break this.
- Time is always `dt` passed into `step`. Never `Date.now()` in `core/`.
- Tile size 16 px, internal resolution 480×272, nearest-neighbour scaling, integer scale only.
- Art: 32-colour palette in `docs/palette.json`. Every sprite must be quantised to it before use. No anti-aliasing, no gradients. Light from the top-left.
- Names: files `kebab-case.ts`, types `PascalCase`, constants `UPPER_SNAKE`.
- Keep functions small and pure. Prefer data tables to if-chains for upgrades and monsters.
- No new dependencies without asking. Prefer the standard library.
- Debug panel from day 1: FPS, floor skip, god mode, spawn control, seed set, add emeralds.

## Testing

Unit tests for `core/`: bag fall, push and break; fuel drain; death and extraction payouts; cost formula; seed determinism; floor reachability; save migration. Run `npm test` before finishing any change that touches `core/`.

## Trade-offs (so future-you does not relitigate them)

1. **Pure core vs. using Phaser Arcade physics.** The core uses its own grid-based rules. A tile game with falling bags needs exact, deterministic, testable behaviour. The cost is writing collision logic by hand.
2. **Single-screen floors vs. scrolling levels.** Simpler camera, faster tuning, and faithful to the original. The cost is less spatial exploration. Revisit after the MVP.
3. **JSON-driven data vs. hardcoding.** Faster balance iteration. The cost is a little loading and validation code.
4. **localStorage vs. IndexedDB.** The save is under 10 KB, so localStorage is enough and simpler. The cost is a ~5 MB limit and no cross-device sync.
5. **No backend.** No leaderboards or cloud saves in v1. Add a tiny backend later only if a daily seeded dive with a leaderboard is wanted.

## Future evolution

- **Easy to add:** new monsters, biomes and upgrades (data plus a small rule), the daily seed (already deterministic), touch and gamepad (input layer), Hebrew UI (text lives in data files).
- **Deliberate debt:** render interpolation, a proper asset pipeline, and a tiny level editor are all deferred. Revisit after the week 3 playtest.
- **Mobile later:** Capacitor wrapper, with an on-screen d-pad mapped to the same `Action` enum.

## Art

- `docs/palette.json` is the only source of colours. All 32 entries are the authoritative list; no colour values live anywhere else in code.
- Assets come from `npm run art` (`tools/art/generate.mjs`). Never hand-edit the exported PNGs in `public/assets/sprites/`.
- `docs/visual-direction.html` and `docs/art-reference/` are the style reference. The mockup PNGs in `docs/art-reference/` are targets, not game assets — do not copy them to `public/`.
- Scenes must match the mockups: HUD in the top 16 px row, 28×15 playfield, integer scaling only.

## Working agreement

Work autonomously and stop only when a decision genuinely needs the owner. When you make an assumption, write it in `docs/decisions.md` (one line each) so it can be reviewed later.
