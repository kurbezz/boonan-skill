---
name: boonan
description: Build and edit games on the boonan.io node-graph platform (ruDimbo engine) through a bundled headless socket.io CLI. Use when working on a boonan.io project - creating or patching node graphs (nodes/links JSON), adding systems and components, changing gameplay values, uploading images or sounds, editing tile maps or UI scenes, building the game, or debugging the editor's file API.
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

1. **Locate** - `ls`, then `nodes` to find candidates and `trace` to see
   inputs and downstream nodes. The graph is the source of truth; do not
   edit from notes.
2. **Edit** - value tweaks: `set` / `batch` with `--expect <current value>`.
   Structure: `add-node`, `link`, `rm-node`, or `put` a whole graph.
   Look up every `schemaId` in [reference/nodes.md](reference/nodes.md);
   never guess one.
3. **Build** - `build "<Title>"`.
4. **Verify visually** - open the URL from `url` and take a screenshot. A
   successful build does not prove the game works. See
   [reference/verifying.md](reference/verifying.md).

New feature or new game: read [reference/recipes.md](reference/recipes.md)
first for the ECS model and step-by-step node chains.

## Commands

```sh
# inspect
node cli.js ls                                    # files, sizes, protected flags
node cli.js cat systems move.json                 # raw content + version
node cli.js nodes systems move.json --value 40    # filter nodes (--grep, --schema, --value)
node cli.js trace systems move.json n_xxx         # inputs + downstream chain
# edit values
node cli.js set systems move.json n_xxx fieldValues.value 100 --expect 40
node cli.js batch edits.json                      # ops: set | add-node | link | unlink | rm-node
# edit structure
node cli.js add-node systems move.json For_Each_Entity__action --fields '{"query":"player"}'
node cli.js link systems move.json n_a exec n_b exec
node cli.js unlink systems move.json n_a exec n_b exec
node cli.js rm-node systems move.json n_xxx
node cli.js put systems move.json ./local.json    # replace whole graph
# files
node cli.js new systems ai.json                   # empty {nodes:[],links:[]}
node cli.js mv systems ai.json enemy_ai.json
node cli.js rm systems enemy_ai.json
# assets, maps, UI
node cli.js upload img/Tilesets ./grass.png --register  # raw bytes + assets/images.json node
node cli.js map new level_1 --register                  # also: tile, fill, object, show, get/put
node cli.js ui add-layer hud.json --json '{"name":"score"}'  # also: layers, set, rm-layer, put
# ship
node cli.js build "Title"
node cli.js url
```

Use `.` as the folder for root files (`node cli.js nodes . game.json`).
Output is always JSON; failures return `{"ok":false,...}` with exit code 1.
`node cli.js help` lists every subcommand and the batch format.
`upload --dry-run`, `map validate --local`, and `ui validate --local` work
without a cookie.

The client sends `baseVersion` on every write (retries on conflict),
validates the graph before sending, skips no-op writes, and paces writes.
For scripted edits, `require('./scripts/client')` exposes `Boonan`
(`readGraph`, `edit`, `setNodeFields`, `build`) and pure helpers
(`addNode`, `addLink`, `removeNode`, `removeLink`, `validateGraph`).

## Project layout

| path | contents |
|---|---|
| `game.json` | entry graph: `On_Start__event`, `On_Tick__event`, `Add_System__action` list |
| `systems/*.json` | one graph per concern, root `On_System_Update__event` |
| `components/*.json` | custom components (`Component__event` with `fieldValues.properties`) |
| `assets/*.json` | `Register_*__action` nodes; a game node only sees assets registered here |
| `img/`, `audio/`, `ui/img/` | binaries, uploaded with `upload` ([assets.md](reference/assets.md)) |
| `maps/*.json` | tile maps, custom format ([map.md](reference/map.md)) |
| `ui/*.json` | UI scenes ([ui-scene.md](reference/ui-scene.md)) |
| `objects/` | map object presets |

Limits: 5 projects, 15 MB per project, 5 MB per file.

## Common mistakes

| Mistake | Fix |
|---|---|
| Extra root keys in a graph | Root must be exactly `{nodes, links}` |
| Invented `schemaId` | Copy from nodes.md; format `Label_Words__action\|__getter\|__event` |
| New system file does nothing | Add `Add_System__action`(file) to `game.json`; node order = execution order |
| Entity invisible to systems | `Core_Query_add__action` (Register Entity) after Create Entity |
| Getter on an empty query crashes the frame | Use `Query_First_Entity__action` → `found` branch, or `Is_Valid__getter` |
| `Get_Variable__getter` inside `systems/` | Game scope only; store state in component fields |
| Treating `Less(getDistance, N)` as a radius | Center-to-center distance; N = sum of both radii |
| Resizing a sprite and expecting collider/thresholds to follow | Sprite, collider, thresholds are independent - update all three |
| Writing a field another node already writes | Find writers first: `nodes --grep '"component":"<name>"'` |
| Sending a data URL as upload `fileData` | Stored as literal text; use `upload`, which sends raw bytes and checks the stored size |
| Uploaded asset not found by `Assets_Image_Asset__getter` | Not registered; `upload ... --register` (name = path under `img/` without ext) |
| `UIScene_On_UI_Click__event` never fires | Its `layer` matches the layer **name**, not the id |

## Reference

- [reference/nodes.md](reference/nodes.md) - all 199 node schemas: id, kind, scopes, params, ports, behaviour notes. Grep by label or category.
- [reference/graph-format.md](reference/graph-format.md) - node/link JSON shape, ports, scope per folder, component file format.
- [reference/recipes.md](reference/recipes.md) - ECS mental model and step-by-step chains: draw, move, camera, map, collisions, sound, UI, timers.
- [reference/assets.md](reference/assets.md) - binary upload, encoding, registration rules.
- [reference/map.md](reference/map.md) - map JSON (tilesets, tile cells, objects) and `map` commands.
- [reference/ui-scene.md](reference/ui-scene.md) - UI scene JSON (19 layer fields) and `ui` commands.
- [reference/protocol.md](reference/protocol.md) - socket.io events, headers, versioning, browser-side globals.
- [reference/verifying.md](reference/verifying.md) - canvas layout and pixel checks for screenshot verification.
