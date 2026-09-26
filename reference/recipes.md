# Building a game: recipes

`game.json` is the root graph: `On_Start__event` runs once (setup: register assets, create entities, init camera/map/UI), `On_Tick__event` runs every frame. Systems are separate graphs in `systems/`, each registered from `game.json` with `Add_System__action`. Registration is init metadata, not ordinary event flow. A single Add System may be disconnected; to make movement, camera, then drawing explicit, use this homogeneous chain:

```text
Add_System(move.json).exec → Add_System(camera.json).exec → Add_System(draw.json).exec
```

Do not connect `On_Start__event` or `On_Tick__event` to an Add System input. That input accepts another Add System only; an Add System output may continue ordinary flow. This is specifically an Add System rule, not a general rule for mixing init-node kinds.

## Mental model

- ECS: entities are empty IDs, behavior comes only from attached components. No node touching an entity → no behavior, even if it exists on the map.
- Engine components (built-in, always available): `position{x,y}`, `sprite{texture,offset,width,height}`, `colliderRect{width,height,dynamic}`, `colliderCircle{radius,dynamic}`, `bbox{width,height,row,col}`, `path{list}`, `player` (marker, no fields).
- Queries select entities by component name(s) joined with `.`, e.g. `player`, `sprite`, `colliderRect.sprite`. `For_Each_Entity__action` and `Query_First_Entity__action` take a `query` string.
- White/round ports are `exec` (flow, order of execution). Colored ports are data. Only exec-port nodes are steps; getters and math nodes (hatched header: `Add__getter`, `Multiply__getter`, `Worlds_Get_Component__getter`, `Assets_Image_Asset__getter`) have no exec ports — they're inlined values evaluated fresh each time something reads them.
- `Add_System__action` and `Inputs_Register_Action__action` are init metadata. Each can stand alone; when ordered, chain only nodes of that same registration kind. Do not connect either directly from `On_Start__event` or `On_Tick__event`.
- The screen is cleared every frame. Anything visible must be drawn every frame, in `On_Tick__event` or in a drawing system.
- Multiply movement speed by `delta` (from `On_Tick__event`/`On_System_Update__event` output) so speed is frame-rate independent.
- Systems have no memory of their own. Persist state on entity components (`Worlds_Set_Component_Fields__action`, `Worlds_Add_Component_Fields__action`), not in system-local variables.
- `Set_Variable__action` / `Get_Variable__getter` only work in `game.json`, not in systems.
- Map objects become entities automatically (position, sprite, collider, custom components from the map editor) — no `Core_Query_add__action` (Register Entity) needed for them.

## Recipes

### First image on screen

1. Register the image: add a `Register_Image_img__action`(name="<path without ext>", ext="png") node to `assets/images.json` (the file itself must already be uploaded to `img/`).
2. In `game.json`: `On_Tick__event`.exec → `Renderer_Draw_Image__action`.exec.
3. `Core_Renderer_getLayer__getter`(name="world") → `Renderer_Draw_Image__action`.layer.
4. `Assets_Image_Asset__getter`(name=<registered image>) → `Renderer_Draw_Image__action`.texture.
5. Set `dstX`, `dstY` (screen position) and `dstW`, `dstH` (screen size) on `Renderer_Draw_Image__action`.

*The screen is wiped every frame — anything that must stay visible has to be redrawn every frame.*

### Create an entity (player)

1. In `game.json`: `On_Start__event`.exec → `Core_Worlds_active_addEntity__action` (Create Entity).exec.
2. From its `entity` output, attach components (these have no exec port — they attach directly): `Worlds_Add_Position__action`(entity, x, y), `Worlds_Add_Sprite__action`(entity, texture ← `Assets_Image_Asset__getter`, width, height).
3. For the player entity add `Worlds_Mark_As_Player__action`(entity) — makes it match the `player` query.
4. After Create Entity, continue the exec chain into `Core_Query_add__action` (Register Entity)(entity) — required or systems won't see the entity.
5. For collisions add `Worlds_Add_Collider_Rect__action` or `Worlds_Add_Collider_Circle__action`(entity).

### Draw all objects

1. New file `systems/draw.json`: `On_System_Update__event`.exec → `Map_Draw_Map_Below__action`.exec → `For_Each_Entity__action`(query="sprite").exec → `Map_Draw_Map_Above__action`.exec.
2. Inside the loop `body` branch: `Renderer_Draw_Image__action`, `layer` ← `Core_Renderer_getLayer__getter`(name="world").
3. `Worlds_Get_Component__getter`(entity, component="sprite"): its `texture` output → `texture`, `width`/`height` outputs → `dstW`/`dstH`.
4. `Worlds_Get_Component__getter`(entity, component="position"): `x` → `dstX`, `y` → `dstY`. To apply the sprite's `offset`, split it with `Vector2_X__getter`/`Vector2_Y__getter` and sum into position via `Add__getter`.
5. Register the three systems explicitly in `game.json`:
   `Add_System(move.json).exec → Add_System(camera.json).exec → Add_System(draw.json).exec`.
   Do not attach the chain input to `On_Start__event` or `On_Tick__event`.

*`Map_Draw_Map_Below__action` / `Map_Draw_Map_Above__action` draw the map under/over entities; if no map is loaded they do nothing.*

### Move by keys

1. In `game.json`: add `Inputs_Register_Action__action`(action="right", key=D) and another one (action="left", key=A). They may stand alone, or form a Register Action-only chain; do not connect their inputs directly from `On_Start__event`/`On_Tick__event`.
2. New file `systems/move.json`: `On_System_Update__event`.exec → `For_Each_Entity__action`(query="player").exec.
3. In the loop `body`: `Branch__action`, `condition` ← `Inputs_Action_Pressed__getter`(action="right").
4. On the `true` branch: `Worlds_Add_Component_Fields__action`(entity, component="position"), `x` ← `Multiply__getter`(200, `On_System_Update__event`.delta).
5. Repeat for `left` with speed −200, and for up/down using field `y`.
6. Register it with the move → camera → draw Add System chain shown above after all three system files exist.

*Multiply speed by `delta` so it's the same on fast and slow machines.*

### Camera follows player

1. In `game.json`: configure `Core_Camera_init__action`(width, height = game window size).
2. New file `systems/camera.json`: `On_System_Update__event`.exec → `Query_First_Entity__action`(query="player").exec.
3. On the `found` branch: `Camera_Follow__action`, `x`/`y` ← `Worlds_Get_Component__getter`(entity, component="position"). `delta` param 0.1 = smooth follow, 0 = instant snap.
4. Register it with the move → camera → draw Add System chain shown above.

### Map in the game

1. In `game.json`: configure `Map_Load_Map__action`(name="level_1").
2. Map objects become entities automatically with position/sprite/collider/custom components; `Core_Query_add__action` (Register Entity) is not needed for them.
3. In the drawing system keep `Map_Draw_Map_Below__action` before the entity loop and `Map_Draw_Map_Above__action` after it.
4. To find a specific object by its map-editor name, use `Core_Map_getEntity__getter` (Get Map Object) — only valid inside `Map_On_Map_Loaded__event`, since the map loads asynchronously.
5. In systems, fetch map entities the normal way: `For_Each_Entity__action` or `Query_First_Entity__action`.
6. To switch levels use `Map_Load_Map_By_Name__action` instead of `Map_Load_Map__action`.

### Collisions

1. The entity needs `Worlds_Add_Collider_Rect__action` or `Worlds_Add_Collider_Circle__action`; map objects get their collider from the map editor.
2. `Core_Collisions_collided__getter` (Collided)(A, B) → `true` if the shapes overlap; feed into `Branch__action`.
3. `Core_Collisions_update__action` (Resolve Collision) pushes two entities apart. `Collisions_Resolve_Query_Collisions__action` (Resolve Query Collisions) resolves all pairs from two queries at once, e.g. "player" and "colliderRect".
4. Queries are component names joined by `.`: `colliderRect`, `colliderCircle.sprite`.

### Sound

1. Register the sound: add `Register_Sound_audio__action`(name, ext="wav") to `assets/audio.json`; the file must exist in `audio/`.
2. Play it with `Core_Audio_play__action` (Play Sound)(name), stop with `Core_Audio_stop__action` (Stop Sound).
3. `Core_Audio_setGlobalVolume__action` (Set Global Volume)(0–1) controls overall volume.

### UI screen

1. In `game.json`: configure `UIScene_Load_UI_Scene__action`(file="ui/main_menu.json").
2. `UIScene_On_UI_Scene_Loaded__event`.exec → `Core_UIScene_setText__action` (Set UI Layer Text)(layer, text) to fill in a text layer.
3. Handle button clicks in the UI graph: `UIScene_On_UI_Click__event`(layer name).exec → your action chain.
4. Toggle a whole group: `Core_UIScene_setNodeVisible__action` (Set UI Layer Visible)(group name, visible).
5. Switch screens with `UIScene_Load_UI_Scene_By_Name__action`, remove one with `Core_UIScene_unload__action` (Unload UI Scene).

### Timers and one-shot logic

1. `Do_Once__action` runs its exec chain exactly once (game.json only).
2. `On_Interval__action` fires every N seconds (game.json only).
3. For per-entity timers, store the accumulator on a custom component field and increment it in a system with `Worlds_Add_Component_Fields__action`(entity, component, value ← delta on that field's port).

## Custom components

- A component is a graph file `components/<name>.json`; the file name becomes the component's class name (e.g. `health.json` → class `health`).
- The graph contains one `Component__event` node; fields live in its `fieldValues.properties` array (`{name, type, default}`, type `number` | `string` | `bool` | `array` | `object` | `entity` | `enum`). See graph-format.md.
- Once saved, a `Component_<name>__action` schema exists (inputs: `entity` + one per property) for attaching the component; map-editor objects can carry its fields too.
- `Worlds_Get_Component__getter` (Get Component) exposes every declared property of the chosen component as a separate output port — no per-field getter node needed.
- `Worlds_Set_Component_Fields__action` / `Worlds_Add_Component_Fields__action` build one port per property too: only ports you actually connect are written/added; unconnected fields are left untouched.

## Pitfalls

- Feeding an empty/invalid entity into an `entity` port crashes the frame. Prefer `Query_First_Entity__action` (has a `found` branch) over `Query_First_In_Query__getter`, or guard with `Is_Valid__getter`.
- After `Core_Worlds_active_addEntity__action` (Create Entity) you must call `Core_Query_add__action` (Register Entity) or systems/queries never see the entity. Map-spawned entities don't need this.
- `Core_Map_getEntity__getter` (Get Map Object) only works inside `Map_On_Map_Loaded__event` — the map loads asynchronously, it isn't ready right after `Map_Load_Map__action`.
- `Map_Draw_Map_Below__action` / `Map_Draw_Map_Above__action` are no-ops if no map is loaded.
- Standard/default project files cannot be deleted.
- Project limits: 5 projects, 15 MB per project, 5 MB per file.
- `Set_Variable__action` / `Get_Variable__getter` and `Do_Once__action` / `On_Interval__action` only work in `game.json`, not inside `systems/*.json` graphs.
- Systems keep no state between frames on their own — anything that must persist goes on a component field.
- A red build error means the game won't compile; it names the file and node to fix. A yellow warning still compiles but flags something like a disconnected node or an empty graph.
