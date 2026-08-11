# Claude Pet 🐱

A desktop companion for Claude Desktop on Windows: a frameless, transparent,
always-on-top overlay containing a cartoon cat whose posture tracks what Claude
is doing right now.

## Quick start

```bash
npm install
npm run dev          # watch build + Electron, with renderer hot reload
npm start            # production build + run
npm test             # bundle the TypeScript tests and run them
```

## Requirements

- Windows 10/11
- Node.js 20+
- Claude Desktop, for the MCP integration

## The character

The companion ships with **two interchangeable 2D characters**, selected by the
`character` setting. Both are pure Canvas2D — there is no 3D, no WebGL and no
model file anywhere in the runtime.

| `character` | What it draws | Assets |
| --- | --- | --- |
| `sprite` *(default)* | An orange-tabby cartoon cat, played from a baked sprite sheet | `assets/character/cat-sheet.png` |
| `procedural` | The original hand-rigged vector cat, damped in real time | none |

`sprite` falls back to `procedural` automatically: the procedural rig draws
while the sheet decodes, and simply stays if the sheet is missing or corrupt. A
missing asset costs you the artwork, never the companion.

### Regenerating the sheet

The artwork is code. `npm run sprites` redraws every frame and rewrites both the
sheet and its manifest:

```
scripts/sprites/raster.mjs   a small anti-aliased rasteriser and PNG writer
scripts/sprites/cat.mjs      the character: one function from a pose to a frame
scripts/sprites/clips.mjs    the animation table: one clip per state
scripts/generate-sprites.mjs bakes assets/character/cat-sheet.png
                             + src/renderer/rig2d/sheetManifest.ts (generated)
```

Adding an expression means adding a clip in `clips.mjs`, regenerating, and
adding one line to `src/renderer/rig2d/clipForState.ts`.

### Using your own artwork

The renderer only needs a grid of square frames plus a manifest saying which row
is which clip, so any 2D art works — exported GIF frames, commissioned clip art,
a pixel-art sheet:

1. Export your frames as one PNG grid, all cells square and the same size, laid
   out one clip per row starting at column 0.
2. Save it as `assets/character/cat-sheet.png`.
3. Edit `src/renderer/rig2d/sheetManifest.ts` — set `FRAME_SIZE` to your cell
   size, `SHEET_COLUMNS` to the widest row, and give each clip its row, frame
   count and fps. Stop running `npm run sprites`, which overwrites both files.
4. `npm run build`.

A note on GIFs specifically: an animated GIF drawn to a canvas plays on its own
timeline and cannot be paused, re-paced or synchronised with Claude's state, so
the frames have to be split out into a sheet rather than used directly. Any
frame extractor will do.

## Features

- **Transparency** — click-through everywhere except the character's silhouette
- **Focus following** — hides when Claude Desktop is not frontmost (configurable)
- **Start with Windows** — a real login item, toggled from the tray
- **Nine states** — idle, thinking, reading, typing, executing, working,
  success, error, sleeping
- **Reduced motion** — honours the OS setting, or force it either way
- **Cheap when quiet** — the loop halves its rate when idle and stops entirely
  when hidden

## Connecting to Claude Desktop

```bash
npm run register
```

This merges an entry into `%APPDATA%\Claude\claude_desktop_config.json`,
preserving every other server and key, after taking a backup alongside it.
Claude Desktop only reads that file at launch, so quit it fully from the tray —
closing the window is not enough.

## Layout

```
src/shared/     contracts shared by all three processes (state protocol, IPC, settings)
src/main/       window ownership, overlay behaviour, state sources, configuration
src/preload/    the contextBridge surface, and nothing else
src/renderer/   canvas engine, both characters, animation state machine, overlay UI
  rig/          the procedural vector rig
  rig2d/        the sprite sheet loader, player and clip table
  scenes/       companionScene (procedural) and spriteScene (sheet)
src/mcp/        the MCP server Claude Desktop launches as a stdio child
specs/          the state protocol contract
test/           node:test suites, bundled through the same esbuild config as the app
```

## Settings

Stored as JSON under Electron's user-data directory. Every field is clamped and
normalised on read, so a hand-edited file can never produce an invalid state.

| Key | Default | Notes |
| --- | --- | --- |
| `character` | `sprite` | `sprite` or `procedural` |
| `launchAtLogin` | `false` | Windows login item; also toggled from the tray |
| `startHidden` | `false` | Start in the tray rather than on screen |
| `followClaudeFocus` | `true` | Hide when Claude Desktop is not frontmost |
| `scale` | `1` | 0.6 – 1.6 |
| `motion` | `1` | 0 – 1.5; 0 stills the character without hiding it |
| `motionPreference` | `auto` | `auto`, `full` or `reduced` |
| `anchor` / `position` | `bottom-right` / `null` | An explicit position wins |
| `showTaskPanel` | `true` | The panel beside the character |
| `frameRateCap` | `60` | 24 – 144 |
| `logLevel` | `info` | Overridden by the `SABER_LOG` environment variable |

## License

MIT.
