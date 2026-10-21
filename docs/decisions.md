# Design Decisions

- Used flat ESLint config (eslint.config.js) — ESLint 10 defaults to flat config.
- Kept vite.config.ts and vitest.config.ts separate to avoid Vitest type augmentation on the Vite config.
- Build script is `tsc && vite build`: TypeScript type-checks first (noEmit), then Vite bundles.
- chunkSizeWarningLimit set to 2500 KB because Phaser 3 is ~2 MB bundled.
- Boot scene shows background colour #1a0a2e (dark indigo) — placeholder until the Title scene.
- Pinned Phaser 3 (3.90.0) not Phaser 4 — CLAUDE.md specifies Phaser 3 as the stack.
- Used regular enum for TileType and Action (not const enum) — Vite/esbuild strips types without compiling, so cross-file const enums are unsafe.
- `"type": "module"` added to package.json so eslint.config.js uses ESM imports.
