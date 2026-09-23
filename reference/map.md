# Map format (`maps/*.json`)

This is a custom format, not Tiled. The CLI's `map` commands read, validate,
and write it.

```json
{
  "version": 1, "cols": 40, "rows": 30, "tileSize": 32,
  "tilesets": [
    { "id": "ts_grass", "relativePath": "img/Tilesets/grass.png", "cellSize": 32, "imageW": 256, "imageH": 256 }
  ],
  "layers": [
    { "id": "layer_ground", "name": "ground", "type": "tiles", "visible": true,
      "cells": [ ["0,0", { "tilesetId": "ts_grass", "tileId": "ts_grass_t_0" }] ] },
    { "id": "layer_entities", "name": "entities", "type": "entities", "visible": true, "cells": [] }
  ],
  "objects": [
    { "name": "spawn", "x": 96, "y": 96, "w": 32, "h": 32 }
  ]
}
```

## Fields

| part | notes |
|---|---|
| root | `cols` x `rows` cells of `tileSize` px each. `layers` is present in editor maps; `objects` and `tilesets` may be omitted and default to `[]` |
| tileset | `relativePath` is the image path under the project. The grid is `gridW = imageW / cellSize` and `gridH = imageH / cellSize`. Unknown fields (e.g. `autotiles`) are preserved |
| layer `type` | `tiles` (painted cells), `objects`, or `entities`. The `entities` layer marks where entity sprites are drawn: layers above it are drawn over entities (`Map_Draw_Map_Above__action`), layers below it under them |
| cell | a pair `["<col>,<row>", {tilesetId, tileId}]`. There is at most one pair per key in each layer. Existing editor maps can explicitly store an empty cell as `["<col>,<row>", {"tilesetId":null,"tileId":"0"}]`; the validator accepts and preserves this exact placeholder. |
| `tileId` | `<tilesetId>_t_<index>` where `index = row * gridW + col` inside the tileset image, 0-based. The CLI accepts a bare index (`7`) and stores the full form |
| object | `name` is how the game finds it (`Core_Map_getEntity__getter`, only inside `Map_On_Map_Loaded__event`). `x`, `y`, `w`, `h` are in px. Optional: `sprite {tilesetId, tileId}`, `collider`, `defId` (preset in `objects/<defId>.json`), `components {<name>: {<field>: value}}` |

Objects become entities automatically, with position, sprite, collider, and
components. They do not need `Core_Query_add__action`.

The `collider` and preset examples below were captured from files saved by
the map editor on a sandbox project. The CLI preserves unknown object fields.
That confirms the saved JSON shape, not collision behavior at runtime.

## Wiring to the game

1. Upload the tileset image: `upload img/Tilesets ./grass.png --register`.
2. Create the map and register it with `map new level_1 --register`. This adds
   `Register_Level_maps__action` to an existing `assets/*.json` graph. The CLI
   prefers `assets/levels.json` when it exists; otherwise it uses an existing
   asset graph (such as `images.json`). It never creates `levels.json`, because
   the editor can protect standard asset files. If no asset registry exists,
   create one explicitly in the editor before registering; `map new --register`
   preflights this condition and will not create the map.
3. In `game.json`, add `Map_Load_Map__action`(name="level_1").
4. In the draw system, put `Map_Draw_Map_Below__action` before the entity loop
   and `Map_Draw_Map_Above__action` after it.

## Commands

```sh
node cli.js map new level_1 --cols 40 --rows 30 --tile 32 --register
node cli.js map add-tileset level_1 img/Tilesets/grass.png --cell 32 --local ./grass.png
node cli.js map fill level_1 ground 0 0 39 29 ts_grass 0      # inclusive rect
node cli.js map tile level_1 ground 5 5 ts_grass 7
node cli.js map erase level_1 ground 5 5
node cli.js map show level_1 --layer ground                   # ASCII preview + legend
node cli.js map object level_1 spawn --x 96 --y 96 --w 32 --h 32 --json '{"components":{"player":{}}}'
node cli.js map objects level_1
node cli.js map info level_1
node cli.js map resize level_1 60 40
# bulk: pull, edit locally, validate, push
node cli.js map get level_1 --out ./level_1.json
node cli.js map validate ./level_1.json --local
node cli.js map put level_1 ./level_1.json
node cli.js map preset new collider_1 --w 32 --h 32
node cli.js map preset get collider_1 --out ./collider_1.json
node cli.js map preset validate ./collider_1.json --local
node cli.js map preset put collider_1 ./collider_1.json
```

## Object presets (`objects/*.json`)

The following form was saved by the map editor (the CLI preserves unknown
fields). `map preset new` makes this same default sprite shape with an empty
`colliders` array; it does not add an object to a map.

```json
{
  "version": 1,
  "name": "collider_1",
  "size": {"w": 32, "h": 32},
  "sprite": {"tilesetId": null, "tileId": null, "cols": 1, "rows": 1, "relativePath": null, "sx": 0, "sy": 0, "sw": 0, "sh": 0},
  "colliders": [
    {"id": "col_rect", "type": "rect", "x": 0, "y": 0, "w": 32, "h": 32},
    {"id": "col_circle", "type": "circle", "x": 16, "y": 16, "r": 16},
    {"id": "col_polygon", "type": "polygon", "points": [[0,32],[16,0],[32,32]]}
  ]
}
```

`map preset put` only replaces an existing preset through an optimistic,
validated edit. Create a missing preset first with `map preset new`. A map
object can reference it with `defId`; editor-saved objects can also include an
object-layer `layerId` and a nullable or typed `collider`, for example
`{"type":"circle","dynamic":false}`. These are saved editor forms; this
reference does not claim any visual or build behavior.

`add-tileset` reads the image size from the local PNG header. Without
`--local`, pass `--w` and `--h`.
