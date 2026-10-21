# Design Decisions

- Used flat ESLint config (eslint.config.js) — ESLint 10 defaults to flat config.
- Kept vite.config.ts and vitest.config.ts separate to avoid Vitest type augmentation on the Vite config.
- Build script is `tsc && vite build`: TypeScript type-checks first (noEmit), then Vite bundles.
- chunkSizeWarningLimit set to 2500 KB because Phaser 3 is ~2 MB bundled.
- Boot scene shows background colour #1a0a2e (dark indigo) — placeholder until the Title scene.
- Pinned Phaser 3 (3.90.0) not Phaser 4 — CLAUDE.md specifies Phaser 3 as the stack.
- Used regular enum for TileType and Action (not const enum) — Vite/esbuild strips types without compiling, so cross-file const enums are unsafe.
- `"type": "module"` added to package.json so eslint.config.js uses ESM imports.

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
