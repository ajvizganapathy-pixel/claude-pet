# Build brief — Saber, a desktop companion for Claude Desktop (Windows)

## Goal

A frameless, transparent, always-on-top Electron window pinned to the corner of my screen, containing a hand-rigged 2D saber-toothed cat that reflects what Claude Desktop is doing right now — reasoning, reading, writing, running commands, finishing, failing. It should read as a piece of the product, not a desktop toy: quiet, warm, and never in the way of typing.

Done means: I start Claude Desktop, ask it to do something real, and the cat's posture and status bubble track the work without me touching anything.

## Hard constraints

- **Windows 10/11 only.** Electron + TypeScript. No cross-platform abstraction layer.
- **Never modify Claude Desktop.** State comes from the MCP server in this repo (`specs/state-protocol.md`) plus log tailing as a passive fallback. Do not screen-scrape, inject, or patch the app.
- **The window must be click-transparent everywhere except the cat's own silhouette** (`setIgnoreMouseEvents(true, {forward:true})`, re-enabled on hit-test). If this regresses, the whole thing becomes unusable — it eats clicks on whatever is underneath.
- **Rendering is 2D vector on canvas, drawn procedurally.** No sprite sheets, no external model files, no 3D. The rig is code.
- **60 FPS with the loop asleep when nothing is happening.** Idle state should not keep a core warm; pause `requestAnimationFrame` when the window is hidden.
- Don't ship sound on by default.

## References

- **`companion-prototype.html`** — the working rig. This is the spec for the character, the animation blending, the palette, and the eight states. Port it directly; don't redesign it. Everything worth knowing about how the cat should move is in the `STATES` table and the damping loop.
- **`specs/state-protocol.md`** — the event contract between the MCP server and the renderer. This is the load-bearing piece; read it before writing any main-process code.
- **`CLAUDE.md`** — Windows gotchas that will otherwise cost a day each.

## Judgement calls (left to you)

Folder layout, build tooling, IPC serialization, settings storage format, how the settings window looks, logging, and test structure. Match whatever you set up in the first pass consistently. If the rig needs restructuring to support blending between more than two states, restructure it — the prototype's single-target damping is the simple version, not the required one.

## Success check

Run `npm run dev`, then in Claude Desktop ask it to read a few files and run a build in a scratch repo. The cat should visibly move through reading → thinking → executing → success or error, and the status bubble text should change within ~300ms of each transition. Clicking through the transparent area of the window onto the app behind it must still work.
