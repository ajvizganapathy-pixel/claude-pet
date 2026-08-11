# Claude Pet 🐱

A desktop companion for Claude Desktop on Windows: a frameless, transparent,
always-on-top overlay containing a cartoon cat whose posture tracks what Claude
is doing right now.

## Install

```bash
git clone https://github.com/ajvizganapathy-pixel/claude-pet
cd claude-pet
npm install
npm run setup
```

`npm run setup` builds, registers the MCP server with Claude Desktop, and then
verifies the whole chain. It is safe to re-run, and it never overwrites another
server in your config — see [Connecting to Claude Desktop](#connecting-to-claude-desktop).

Then:

1. **Quit Claude Desktop fully from the system tray** and reopen it. The config
   is only read at launch, so closing the window is not enough.
2. `npm start`
3. Ask Claude to do something real, and watch the character.

If the companion ever stops reacting, `npm run doctor` says which link is broken.

## Requirements

- Windows 10/11
- Node.js 20+
- Claude Desktop, for the MCP integration

## Everyday commands

```bash
npm run dev          # watch build + Electron, with renderer hot reload
npm start            # production build + run
npm test             # bundle the TypeScript tests and run them
npm run doctor       # check the Claude Desktop -> companion chain
npm run sprites      # rebake the character sheet
```

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

Claude Desktop has no state API, so the companion does not observe it from
outside. It ships an **MCP server** that Claude Desktop launches as an ordinary
stdio child, and Claude's own reporting becomes the state signal:

```
Claude Desktop  --stdio-->  dist/mcp/server.js  --named pipe-->  companion
                                              \\.\pipe\saber
```

`npm run setup` wires this up; `npm run register` does the registration step
alone. Either way the entry is **merged** into
`%APPDATA%\Claude\claude_desktop_config.json` — every other server and key is
preserved verbatim, a backup is written alongside, and the file is only
rewritten when something actually changes:

```bash
npm run register              # add or update the entry
npm run register -- --check   # show what would change, write nothing
npm run register -- --remove  # take the entry out again
```

### What the server exposes

Two tools, and both only report — there is no file access and no shell:

| Tool | When Claude calls it | What the companion does |
| --- | --- | --- |
| `report_activity` | starting or changing a piece of work | plays the matching state clip |
| `report_result` | that work finished | shows success or error |

The server also sends MCP `instructions` at connection, which is what makes this
happen without you asking. Tool descriptions explain a tool to a model already
looking for one; the instructions are what prompt it to look.

### How much is automatic

| Signal | Source | Confidence |
| --- | --- | --- |
| reading, executing, working, success, error | `report_activity` / `report_result` | exact |
| thinking, typing, and the typing speed | tailing `%APPDATA%\Claude\logs\` | inferred, best effort |
| idle vs. sleeping | foreground-window polling | fallback |

Each rung degrades to the next, so the companion never shows a state it cannot
justify. The log format is undocumented and changes between Claude Desktop
versions; when it cannot be parsed the companion sits and breathes rather than
guessing. See [`specs/state-protocol.md`](specs/state-protocol.md).

### Checking it works

```bash
npm run doctor
```

It walks the whole chain and names the broken link — a build that was never run,
a config another tool edited, a registration left pointing at a directory you
moved the repo out of, Claude Desktop never restarted after registering. None of
those report an error anywhere else; they just leave the character sitting
still.

The tray menu also shows `Claude Desktop — connected` once Claude Desktop has
launched the server and it has reached the companion. To exercise a state by
hand without waiting for Claude:

```bash
node scripts/send-state.mjs executing "Running tests…" "npm test"
```

### If you move or re-clone the repo

The registered entry holds an absolute path, so it will point at the old
location. Re-run `npm run register` (or `npm run setup`) and restart Claude
Desktop. `npm run doctor` detects exactly this case.

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
