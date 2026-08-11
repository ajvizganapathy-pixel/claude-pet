# Saber

A desktop companion window for Claude Desktop on Windows. Electron shell, procedural 2D canvas rig, driven by an MCP server that Claude Desktop connects to.

Three processes matter: **main** (window, tray, foreground-window polling), **renderer** (the rig — see `companion-prototype.html` for the reference implementation), and **the MCP server** (stdio child, emits state events). Read `specs/state-protocol.md` before touching the wiring between them.

## Gotchas worth knowing before you spend a day on them

**Transparent windows on Windows are fragile.** `transparent: true` must be set at construction and cannot be toggled later. Combined with `frame: false` you also lose the drop shadow and the resize handles — expected, don't try to restore them. If the window renders opaque black, it's almost always hardware acceleration; `app.disableHardwareAcceleration()` fixes it but costs GPU compositing, so try `backgroundColor: '#00000000'` first.

**"Always on top of Claude Desktop only" is not a real Electron feature.** The approach that works: `setAlwaysOnTop(true, 'screen-saver')` plus polling the foreground window (`node-window-manager` or `get-windows`, ~400ms) and hiding when `claude.exe` isn't frontmost. Poll on a timer in main, not the renderer.

**Click-through needs re-arming.** `setIgnoreMouseEvents(true, {forward: true})` forwards move events so you can still hit-test, but every call to `setIgnoreMouseEvents(false)` must be paired or the window permanently swallows clicks. Hit-test against the cat's bounding box in the renderer and message main only on enter/exit, not per frame.

**MCP config lives at `%APPDATA%\Claude\claude_desktop_config.json`.** Claude Desktop only reads it at launch — the app must be fully quit from the tray, not just closed. Logs are at `%APPDATA%\Claude\logs\`.

**The MCP server sees tool calls, not thoughts.** `thinking` and `typing` states are inferred from the gap between calls and from streaming activity in the logs, not reported directly. Treat those two as best-effort; the rest are exact.

**What makes the companion animate at all is the server's `instructions`, not the tool descriptions.** A description explains a tool to a model that is already looking for one; nothing prompts it to look. If the character stops reacting during ordinary sessions after a change to `src/mcp/server.ts`, check that `INSTRUCTIONS` is still passed to the `Server` constructor before suspecting the pipe.

**The registration holds an absolute path.** Moving or re-cloning the repo leaves Claude Desktop launching a `server.js` that no longer exists, and nothing anywhere reports it — the character just never moves again. `npm run doctor` exists for exactly this; re-run `npm run register` and restart Claude Desktop after moving the checkout.

**`doctorChecks.ts` must stay free of `fs` and `path`.** It is a pure function over collected facts so the tests can assert Windows behaviour from any machine; the moment it touches the filesystem, `C:\...` paths start resolving against the test runner's cwd and the checks quietly report nonsense. Gather facts in `doctor.ts` and pass them in.

**There are two characters, and only one of them is drawn.** `settings.character` picks between `spriteScene` (a baked sprite sheet, the default) and `companionScene` (the procedural vector rig). The procedural rig is also the stand-in: it draws while the sheet decodes and stays put if the sheet never loads, so `SpriteScene` is never the reason the overlay is blank. If you are debugging "the character looks wrong", check which one is actually on screen before reading any rig code.

**The sprite sheet's manifest is generated.** `src/renderer/rig2d/sheetManifest.ts` is written by `npm run sprites` alongside the PNG — edit `scripts/sprites/clips.mjs` and regenerate, or your change is gone at the next bake. The manifest is a TypeScript module rather than JSON because the renderer runs under `default-src 'none'` with no `connect-src` and cannot fetch a sidecar file.

**Dead renderer code does not fail the build.** esbuild starts at `boot.ts` and bundles only what it reaches, so a scene nothing imports can reference missing modules and missing packages indefinitely while `npm run build` reports success. `npm run typecheck` is the check that catches it; run it before believing a build.

## Conventions

Animation values live in one flat rig object and are damped toward targets — never set directly, or motion snaps and the whole thing reads as cheap. Adding an expression should mean adding one entry to the states table and nothing else. In the sprite path the same rule applies one level up: a clip in `scripts/sprites/clips.mjs` is a function from loop position to a pose, and the two channels that cannot be baked (the lean towards the cursor, the accent glow) are still damped at runtime rather than assigned.
