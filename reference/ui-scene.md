# UI scene format (`ui/*.json`)

UI scenes are not node graphs. The CLI's `ui` commands read, validate, and
write them.

```json
{ "schema": 1, "type": "ui-scene", "canvas": { "width": 800, "height": 600 }, "nodes": [ ... ] }
```

`nodes` is a flat list of layers. Hierarchy comes from `parent` (a layer id
or `null`). Groups have `isGroup: true`.

## Layer

Every layer needs all 19 keys. `ui add-layer` fills in defaults, so you only
pass what changes.

| key | shape | notes |
|---|---|---|
| `id` | string | unique |
| `name` | string | **used by game nodes**; `UIScene_On_UI_Click__event`, `Core_UIScene_setText__action`, etc. match on name |
| `parent` | id \| null | |
| `isGroup`, `clip`, `locked`, `clampWidth` | bool | |
| `texture` | string \| null | `/project_url/ui/img/<file>.png`; upload to `ui/img` first |
| `width`, `height`, `rotation` | number | px, degrees |
| `stretch` | `{horizontal, vertical}` | bool each |
| `slice` | `{enabled, left, right, top, bottom}` | 9-slice |
| `frame` | `{x, y, width, height}` | source rect in texture |
| `background` | `{enabled, fillColor, strokeColor, strokeThickness, corners:{topLeft,topRight,bottomLeft,bottomRight}}` | colours `#RRGGBB[AA]` or `""` |
| `anchor` | `{direction, left, right, top, bottom}` | sides are `{value, type: "pixel"\|"percent"}` |
| `text` | `{enabled, string, offsetX, offsetY, fontFamily, fontSize, fontWeight, fillColor, strokeColor, strokeThickness, alignHorizontal, alignVertical}` | |
| `hover`, `click` | `{enabled, event, texture, fillColor, strokeColor, textColor, scale}` | visual state overrides |

`anchor.direction` is one of `left-top`, `center-top`, `right-top`, `left-mid`,
`center-mid`, `right-mid`, `left-bot`, `center-bot`, `right-bot`.

## Wiring to the game

1. Register it: add `Register_UI_Scene_ui__action`(name="<file without .json>") to an `assets/*.json` graph.
2. Load it: `UIScene_Load_UI_Scene__action` in `game.json`.
3. React to it: `UIScene_On_UI_Click__event`(layer="<layer name>"). Change it with `Core_UIScene_setText__action`, `Core_UIScene_setNodeVisible__action`, and so on (see nodes.md, UI Scene).

## Commands

```sh
node cli.js ui new hud.json --width 800 --height 600
node cli.js ui layers hud.json
node cli.js ui add-layer hud.json --json '{"name":"score","text":{"enabled":true,"string":"0"}}'
node cli.js ui set hud.json score text.string "Score: 0" --expect "0"
node cli.js ui rm-layer hud.json panel --recursive
node cli.js ui validate ./hud.local.json --local
node cli.js ui put hud.json ./hud.local.json      # validate, then write with baseVersion
```

`ui set` parses numeric-looking arguments as numbers. To match an existing
text value such as the string `"0"`, pass `--expect '"0"'` (JSON-quoted inside
the shell argument), not `--expect 0`.
