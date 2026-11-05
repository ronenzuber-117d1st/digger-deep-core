# Unused tiles — parking lot

Assets that exist in the sprite sheets but have no code wired up yet.

## monsters sheet

| Frame | Notes |
|---|---|
| `drifter_0`, `drifter_1` | Ghost-type enemy. No entity, no AI, no render case. Needs a new `DrifterEntity` kind + movement rules (float through walls? drift toward player slowly?). |
| `grub_squash` | Death frame for grubs. Currently grubs just disappear on kill. Could play a 1-frame squash on death before removing the entity, using the existing `kill` event. |

## objects sheet

| Frame | Notes |
|---|---|
| `nugget` | Original single-coin nugget tile. Replaced by `nugget_pile_0/1` images. Can be removed from the sheet or repurposed (e.g. the single coin that rolls out of a light bag drop). |

## crew sheet

| Frame | Notes |
|---|---|
| `tessa`, `orin` | Walking-character sprites for Base Camp animation (Chomper is `tessa`). `orin` has no role yet. |
| `radio_0`, `radio_1` | Animated radio. Intended for Base Camp dressing but not placed. |

## portraits sheet

| Frame | Notes |
|---|---|
| `orin` | Second crew member portrait. No dialogue or scene references it yet. |

---

## Ideas / next steps

- **Drifter** — low-priority new monster. Possible design: drifts horizontally, phases through dirt, cannot be killed by bags (passes through), killed by pulse only. Spawns on deeper floors.
- **Grub squash** — quick polish win. On a `kill` event where `kind === 'grub'`, render the squash frame for ~0.3 s before removing the sprite.
- **Orin** — could appear in a second dialogue box at Base Camp for upgrade flavour text, or as a second crew member unlocked later.
- **Radio** — ambient dressing in Base Camp, cycles `radio_0/1` at ~2 fps.
