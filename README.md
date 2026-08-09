# Claude Pet 🐱

A desktop companion for Claude Desktop on Windows: a frameless, transparent,
always-on-top overlay containing a procedurally animated cat (Garfield-style!)
whose posture tracks what Claude is doing right now.

> **🦁 → 🐱 Transformation Complete!** The companion was originally a saber-tooth
> tiger (Saber), now reimagined as a Garfield-style orange cat. All animations
> and behaviors are preserved.

## Quick Start

```bash
npm install
npm run dev          # Development mode with hot reload
npm start            # Production build + run
```

## Features

- **Character**: Garfield-style orange cat (replaceable with other styles)
- **Transparency**: Click-through transparent overlay
- **Positioning**: Appears on secondary monitor (configurable)
- **State Tracking**: 9 distinct behavioral states:
  - 💭 Thinking • 📖 Reading • ⌨️ Typing
  - ⚙️ Executing • ⏳ Working • ✅ Success
  - ❌ Error • 😴 Sleeping
- **Animation**: Smooth crossfade transitions between states
- **Focus Following**: Tracks Claude Desktop window focus (configurable)

## Requirements

- Windows 10/11
- Node.js 20+
- Claude Desktop (for MCP integration)

## Multi-Monitor Layout

```
DISPLAY2 (Primary: 2048×864 @ 0,0)
├─ Claude Desktop

DISPLAY1 (Secondary: 1080×1920 @ -1080,0)
├─ ✅ Claude Pet Companion (Garfield cat)
│   Position: (-1020, 1700), Scale: 0.2
├─ ✅ PO Panda Server (port 3456)
└─ Other system tray apps
```

## Connecting to Claude Desktop

```bash
npm run register
```

This merges an entry into `%APPDATA%\Claude\claude_desktop_config.json`,
preserving every other server and key, after taking a backup alongside it.

## Development Layout

```
src/shared/     contracts shared by all three processes (state protocol, IPC, settings)
src/main/       window ownership, overlay behaviour, state sources, configuration
src/preload/    the contextBridge surface, and nothing else
src/renderer/   canvas engine, character rig, animation state machine, overlay UI
src/mcp/        the MCP server Claude Desktop launches as a stdio child
specs/          the state protocol contract
```

## Technical Details

- **Renderer**: three.js WebGL (3D model with 30 animations)
- **Model**: GLB format (`assets/character/garfield-cat.glb`)
- **Bone Structure**: `head`, `eye.L`, `eye.R` for gaze tracking
- **Named Pipe**: `\\.\pipe\saber` for MCP communication
- **Build**: TypeScript → ESBuild bundling

## Companion Character System

The companion uses a 3D GLB model with:
- 28 bones for full skeletal animation
- 30 animation clips (idle, thinking, reading, typing, etc.)
- Procedural eye tracking and facial expressions
- Crossfade transitions between states

### Changing the Character

Models can be swapped by replacing `assets/character/saber-cat.glb` with a new
GLB file that has compatible bone names (`head`, `eye.L`, `eye.R`).

## Related Projects

- [Claude pet GitHub](https://github.com/ajvizganapathy-pixel/claude-pet)
- [Home stay project](https://github.com/ajvizganapathy-pixel/home-stay)

## License

MIT License - See package.json for details.

---
*Part of the Hermes Agent ecosystem 🦁✨*