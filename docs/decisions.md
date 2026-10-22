# Design Decisions

- Used flat ESLint config (eslint.config.js) — ESLint 10 defaults to flat config.
- Kept vite.config.ts and vitest.config.ts separate to avoid Vitest type augmentation on the Vite config.
- Build script is `tsc && vite build`: TypeScript type-checks first (noEmit), then Vite bundles.
- chunkSizeWarningLimit set to 2500 KB because Phaser 3 is ~2 MB bundled.
- Boot scene shows background colour #1a0a2e (dark indigo) — placeholder until the Title scene.
- Pinned Phaser 3 (3.90.0) not Phaser 4 — CLAUDE.md specifies Phaser 3 as the stack.
- Used regular enum for TileType and Action (not const enum) — Vite/esbuild strips types without compiling, so cross-file const enums are unsafe.
- `"type": "module"` added to package.json so eslint.config.js uses ESM imports.

## Art pass (2026-10-22)

- **Canvas reverted to 480×272** (30×17 tiles × 16 px). The earlier 480×300 / 28 px HUD strip is superseded. The HUD is now drawn inside the top bedrock row (row 0, y=0..15) as sprites on a RenderTexture at depth 10. No `HUD_HEIGHT` constant exists; all game objects render from y=0.
- **Hearts use 10 px spacing** (frame left-edges at x = 4 + i×10). Up to 6 hearts fit in 64 px before the fuel icon. The earlier 12 px spacing recorded on 2026-10-22 is superseded.
- **Bitmap font loaded as Angelcode BMFont** (`coalface` key, `font.xml` descriptor, `font.png` atlas). All in-game text uses this font via `Phaser.GameObjects.BitmapText`. No browser fonts anywhere.
- **Autotile implemented in render/autotile.ts** (never in core). Dirt tiles use a 4-bit empty-neighbour mask → edge/corner/concave/dirt variants. Empty tiles use the N/W shadow rule; narrow corridors use corridor_* variants.
- **Bag wobble during `pendingFallTimer > 0`**: renderer reads `bag.pendingFallTimer` (read-only) and alternates x offset ±1 px every 4 frames at 60 Hz.
- **RunPick scene** (key `'RunPick'`) replaces the old `FloorClear` stub. Offered every 2nd floor (after floor 2, 4, 6 …). Three weighted-random run upgrade cards; selection stored in `RunCarry.runUpgrades[]`.

## Bug fixes (2026-10-22)

- **Canvas was expanded to 480×300** (+28 px for the HUD strip). This is now superseded by the art-pass layout above.
- **P pauses / unpauses.** ESC now shows a Y/N confirm-exit overlay instead of toggling pause directly. The game state remains frozen until the player answers.
- **Bag fall delay** (`tuning.bag.fallDelay`, default 0.5 s): bags countdown via `pendingFallTimer` before physics fall begins, giving enemies time to walk under them.
- **`fallDistance` is NOT reset on a safe landing.** A bag remembers cumulative fall distance across multiple falls, so a bag that previously fell 1 tile will break on the very next 1-tile fall (if `breakMinFall = 2`). Resetting it was a regression introduced when fallDelay was added.
- **Nugget spawn positions are clamped to interior grid tiles.** `spawnNuggets` now skips any `(nx, ny)` where `tileAt` returns `Bedrock` (which covers both the border rows and any out-of-bounds coordinate). Previously, a bag breaking on row 15 could spawn nuggets on row 16 (bedrock) or row 17 (outside the grid), causing coins to appear below the visible play area.

## Week 2 (2026-10-21) — doc drift fixes

- **Economy cost formula** corrected to `baseCost × 1.6^level` with tier base costs 60 (cheap), 90 (mid), 150 (expensive) per design doc. The week-1 scaffold used `100 × 1.5^level`.
- **`maxFuel` added to `PlayerEntity`** so the Fuel Tank permanent upgrade can raise the cap independently of `startFuel`. The deferred decision from week 1 is resolved.
- **`kill` event `kind` union extended** to `'grub' | 'burrower' | 'spitter' | 'nest'` for the new monster types.
- **`FloorClearScene` now carries `RunCarry`** (hp, fuel, emeralds, kills, picks, saveData) between floors instead of just seed/floor so the run context persists across floor transitions.
- **Extraction is a new `RunPhase` (`'extraction'`)** detected in `step.ts` when the player exits at floors 5/10/15/20. The Dive scene routes to `ExtractionScene`.
- **Burrower `noDirTimer`**: tracks seconds since last successful BFS path; starts digging through Dirt after 5 s (tunable `burrower.digDelay`).
- **Spitter fires in the direction of the player** if they are in the same row or column with clear line of sight; otherwise skips this fire cycle. This is the simplest interpretation of "fires along a line".
- **`spawn` event** added to replace the `kill`-with-negative-id hack used by `applyNests`. Audio and render can now distinguish spawn from kill cleanly.
- **Permanent upgrade effects are pre-computed in `DiveScene.startRun()`** from `SaveData.upgrades`, not in the core. Keeps `core/` free of save-data concerns.

## Art pipeline (2026-10-22)

- **HUD supports 6 heart slots at 12px spacing** because Hull (3 levels) raises max HP from 3 to 6. Hearts are 10×10 px drawn at `x = 4 + i*12`; 6 slots fit in 76 px, well within the 480-wide strip.
- **Hull has 3 levels; Extra Pick and Lantern Mount are single-purchase.** Single-purchase upgrades show OWNED after purchase instead of level pips.
- **Spare Fuel and Echo Ping added as run upgrades.** Spare Fuel: +30% fuel now (rarity 1, COMMON). Echo Ping: key E reveals monsters through dirt for 4 s, once per floor (rarity 3, RELIC). Both added to `src/data/upgrades.json` and `docs/deep-core-game-design.html`.
- **Rarity tier (1–3) is a data field** on run upgrades that weights how often a pick is offered in the 3-card draw. Higher rarity = lower weight.
- **No upgrade-unlock system in v1.** All run upgrades are always in the pool. The summary screen shows best floor only.
- **Lantern darkness shading deferred.** The visual-direction "Lantern Dark" atmosphere is only used on deeper biomes. The Lantern run upgrade keeps its design-doc effect: reveals nests and bags within 6 tiles.
- **Biome 3 is named "Crystal Depths"** (not "Crystal Warrens" — the name used in the HUD style-guide canvas is a placeholder).

## Week 1 (2026-10-21)

- **GameEvent type lives in `src/core/events.ts`** (not `step.ts`) to avoid a circular import between `step.ts` and the rule files that both import and produce events.
- **Bag physics uses a within-call while loop** so one `applyBags(dt)` call can complete a full multi-tile fall. Keeps behaviour correct at any frame rate and makes it easy to test by passing a large dt.
- **Nuggets spawn spread around the break position** with no overlap check. Acceptable for week 1.
- **Grub pathfinding recalculates every 0.5 s** (tunable via `tuning.json → grub.pathfindInterval`). BFS on Empty tiles only; Grubs do not dig. If no path, monster waits.
- **Nests are visible (purple rectangle)** in the placeholder render. Full fog-of-war / hidden-tile behaviour deferred to the art pass.
- **Debug seed "set" shows the seed but does not accept typed input.** Entering a seed requires a text input widget; deferred. Use F4 (floor skip) + read the on-screen seed to replay a specific seed.
- **Only one biome (Topsoil) exists in week 1.** All floors use the same generator; biome enum is wired but empty.
- **Grub initial position is placed on an Empty tile** by the generator (`setTile(Empty)` for the Grub spawn position). Ensures the Grub can move on frame 1.
- **Contact damage resolves at end-of-step** from final tile positions only. No mid-move crossing detection. Fine at 60 Hz.
- **Fuel cap uses `tuning.player.startFuel`** as the max; there is no separate `maxFuel` field. Upgrades that raise the cap need a new field on `PlayerEntity` in week 2.
- **`applyNests` emits `{ type: 'kill', targetId: -nestId }` as a spawn signal** to the render layer. This is a temporary hack; replace with a dedicated `spawn` event before audio hooks in.
- **`economy.ts` cost formula** remains base 100 × 1.5^level from the scaffold. The design doc specifies 60/90/150 × 1.6^level per tier; align when the Base scene is built in week 2.
- **Debug keys avoid Chrome browser shortcuts.** F1 (Help), F3 (Find), F5 (Refresh), F6 (address bar), F7 (caret browsing), F11 (fullscreen), F12 (DevTools) are all taken by Chrome. Current safe assignments: `` ` `` toggle panel · F2 god mode · F4 +emeralds · F8 skip floor · F9 spawn grub. When adding new debug keys, pick from F2, F4, F8, F9, F10 or non-F keys.
- **Pause lives entirely in `DiveScene`**, not in `RunState`. `RunPhase` has no `'paused'` value — the scene just stops advancing the accumulator and shows an overlay. This keeps the core free of UI concerns. The help screen (`H`) reuses the same pause flag.
