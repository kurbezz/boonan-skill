---
name: boonan
description: Edit and build games on the boonan.io node-graph platform through a bundled headless socket.io CLI. Use when working on a boonan.io project - inspecting or patching node graphs (nodes/links JSON), changing gameplay values, building the game, or debugging the editor's file API.
---

# boonan.io

A boonan.io game is a set of JSON node graphs (`{nodes, links}`) stored on
the server and edited over socket.io. `scripts/cli.js` talks to that API
directly; no browser is needed.

**Never call `window.NodeMcpCore` / `UIMcpCore` / `MapMcpCore`.** They wrap
the same file API with a 5 s timeout, no `baseVersion`, 3x the traffic, and
drop the session under load.

## Setup

```sh
cd <skill-dir>/scripts && npm install
export BOONAN_COOKIE='connect.sid=...; gid=...'   # from the user's browser DevTools
export BOONAN_PROJECT='<project uuid>'
```

The cookie cannot be obtained automatically (Twitch OAuth). Ask the user for
it; on `session is invalid`, ask for a fresh one.

## Workflow

1. **Locate** - `nodes` to find candidates, `trace` to see inputs and
   downstream nodes. The graph is the source of truth; do not edit from notes.
2. **Edit** - `set` / `batch` with `--expect <current value>`. A mismatch
   aborts the write.
3. **Build** - `build "<Title>"`.
4. **Verify visually** - open the URL from `url` and take a screenshot. A
   successful build does not prove the game works. See
   [reference/verifying.md](reference/verifying.md).

## Commands

```sh
node cli.js ls                                    # files, sizes, protected flags
node cli.js cat systems move.json                 # raw content + version
node cli.js nodes systems move.json --value 40    # filter nodes (--grep, --schema, --value)
node cli.js trace systems move.json n_xxx         # inputs + downstream chain
node cli.js set systems move.json n_xxx fieldValues.value 100 --expect 40
node cli.js batch edits.json                      # [{folder,file,nodeId,key,value,expect}]
node cli.js build "Title"
node cli.js url
```

Use `.` as the folder for root files (`node cli.js nodes . game.json`).
Output is always JSON; failures return `{"ok":false,...}` with exit code 1.
Run `node cli.js help` for details.

The client sends `baseVersion` on every write (retries on conflict),
validates the graph before sending, skips no-op writes, and paces writes.
For scripted edits, `require('./scripts/client')` exposes the same
`Boonan` class (`readGraph`, `edit`, `setNodeFields`, `build`).

## Project layout

| path | contents |
|---|---|
| `game.json` | entry graph |
| `systems/*.json` | one graph per concern (movement, rendering, camera) |
| `components/` | custom components |
| `assets/images.json`, `assets/audio.json` | asset registries; nodes only see assets listed here |
| `img/`, `audio/`, `maps/`, `ui/`, `objects/` | raw files |

Limits: 5 projects, 15 MB per project, 5 MB per file.

## Common mistakes

| Mistake | Fix |
|---|---|
| Extra root keys in a graph | Root must be exactly `{nodes, links}` |
| `schemaId` with dots (`core.onUpdate`) | Only `[A-Za-z0-9_]`, e.g. `On_System_Update__event` |
| Treating `Less(getDistance, N)` as a radius | It compares center-to-center distance; N = sum of both radii |
| Resizing a sprite and expecting collider/thresholds to follow | Sprite size, collider, and distance thresholds are independent - update all three |
| `Get Variable` inside `systems/` | Systems have no own scope; store state in entity components |
| Writing a field another node already writes | Find writers first: `nodes --grep '"component":"<name>"'` |
| Uploading PNG as a data URL via `upload-file-project` | Stored as text; the game renders the literal string. Upload binaries through the editor UI |

## Reference

- [reference/protocol.md](reference/protocol.md) - socket.io events, headers, versioning, browser-side globals. Read when extending `client.js` or debugging connection errors.
- [reference/verifying.md](reference/verifying.md) - canvas layout and pixel-based checks for screenshot verification.
