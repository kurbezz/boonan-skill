# Node catalog

`schemaId` is what goes into a node's `schemaId` field. Params are `name:type=default`; a param with no link reads its literal from `fieldValues.<name>`. `actions` have an implicit flow input `exec` and flow outputs listed under "flow" (default `exec`). `getters` have no flow ports and expose `outs`. Scopes: g = game.json, s = systems/*, m = modules/*, c = components/*, a = assets/*.

## Contents
- [Game](#game)
- [Components](#components)
- [Modules](#modules)
- [System](#system)
- [Signals](#signals)
- [Math](#math)
- [Assets](#assets)
- [Renderer](#renderer)
- [Camera](#camera)
- [Inputs](#inputs)
- [ECS](#ecs)
- [Query](#query)
- [Collisions](#collisions)
- [UI](#ui)
- [UI Scene](#ui-scene)
- [Audio](#audio)
- [AStar](#astar)
- [VFX](#vfx)
- [Map](#map)
- [Streams](#streams)
- [Flow](#flow)
- [Variables](#variables)
- [Values](#values)
- [Operators](#operators)
- [Debug](#debug)

## Game

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `On_Start__event` | event | g |  | — | Init graph root; everything wired to `exec` runs once at load (register assets, create entities, VFX/UI templates). |
| `On_Tick__event` | event | g |  | delta (number), frame (number), timestamp (number) | Main loop root, runs every frame; engine auto-updates Worlds/UI/VFX/Inputs modules, no manual call needed. |
| `Add_System__action` | action | g | file:string="player.json", world:string="world" | exec | Registers a system from `systems/`; its own registration chain sets system order. The input accepts only registration nodes, should not be put in `On Tick`, and its output can continue normal setup; compiler auto-adds the import. (init: true metadata) |
| `Core_setSpeed__action` | action | g/s/m | speed:number=1 | — | Time multiplier: 0.5 slows, 2 speeds up. |
| `Core_stop__action` | action | g/s/m |  | — | Stops the main loop. |

## Components

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Component__event` | event | c |  | none | Component shape; class name comes from filename (`health.json` → `class health`); add fields via "+ property" (number/string/bool/array). |

## Modules

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Module__event` | event | m |  | none | Module declaration; class name from filename (`inventory.json` → `class inventory`), properties become state fields, read/written via `Get`/`Set <name> Field` nodes inside and outside the module. |
| `Method__event` | event | m |  | — | One module method; name, params, return set on the node, body is an exec chain; "action" kind gives exec ports, "value" kind is an expression node (return required). (dynamic: method-params) |
| `Return__action` | action | m | value:any=null | none | Returns a value from a module method and stops execution. |
| `Add_Module__action` | action | g | file:string="" | exec | Registers a module from `modules/`; without it `Core.<name>` and its nodes do not work. Its own registration chain sets registration order; its output can continue setup, which is emitted in `On Start` after asset registration. Compiler auto-adds the import. (init: true metadata) |

## System

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `On_System_Update__event` | event | s |  | delta (number), frame (number), timestamp (number) | System graph root, becomes `export default function SystemName(Core, delta, frame, timestamp)` called every frame; first call happens before `Load Map` finishes (map objects not yet present); get entities via queries (`For Each Entity`/`First Entity` — body skipped on empty query); `Get Map Object` returns null on first frames; persist state with `Set Variable` nodes (compiled to module-level `let`). |

## Signals

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Signals_on__event` | event | g | eventName:string="my-event" | data (any) | Subscribes to a bus event; `data` has the type supplied to `Emit Signal`. |
| `Core_Signals_emit__action` | action | g/s/m | eventName:string="my-event", data:any=null | — | — |

## Math

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Math_randomMinMax__getter` | getter | g/s/m | min:number=0, max:number=100 | number | — |
| `Core_Math_randomMinMaxFloat__getter` | getter | g/s/m | min:number=0, max:number=1 | number | — |
| `Core_Math_getDistance__getter` | getter | g/s/m | x1:number=0, y1:number=0, x2:number=0, y2:number=0 | number | — |
| `Core_Math_getAngle__getter` | getter | g/s/m | x1:number=0, y1:number=0, x2:number=0, y2:number=0 | number | — |
| `Core_Math_lerp__getter` | getter | g/s/m | start:number=0, end:number=1, t:number=0.5 | number | — |
| `Core_Math_angleLerp__getter` | getter | g/s/m | A:number=0, B:number=0, w:number=0.5 | number | — |
| `Core_Math_getPercent__getter` | getter | g/s/m | value:number=0, total:number=100 | number | — |
| `Core_Math_easeInQuad__getter` | getter | g/s/m | t:number=0 | number | — |
| `Core_Math_easeOutQuad__getter` | getter | g/s/m | t:number=0 | number | — |
| `Core_Math_easeInOutQuad__getter` | getter | g/s/m | t:number=0 | number | — |
| `Core_Math_easeOutBack__getter` | getter | g/s/m | t:number=0 | number | — |
| `Core_Math_easeOutElastic__getter` | getter | g/s/m | t:number=0 | number | — |
| `Core_Math_arcTrajectory__getter` | getter | g/s/m | t:number=0, height:number=100 | number | Parabolic trajectory: Y offset for `t` in [0, 1]. |
| `Core_Math_getRandomPointOnCircle__getter` | getter | g/s/m | x:number=0, y:number=0, radius:number=100 | point (vector2) | — |
| `Core_Math_getRandomArrayElement__getter` | getter | g/s/m | array:array=[] | any | — |
| `Core_Math_getVectorLength__getter` | getter | g/s/m | x:number=0, y:number=0, z:number=0 | number | — |

## Assets

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Assets_Image_Asset__getter` | getter | g/s/m | name:string="priest" | texture (texture) | Texture by name registered in `assets/*.json`; picked from a dropdown of names actually present in the project, node previews the image. |
| `Assets_Texture_Width__getter` | getter | g/s/m | texture:texture | width (number) | Loaded texture width in px (0 until loaded). |
| `Assets_Texture_Height__getter` | getter | g/s/m | texture:texture | height (number) | — |
| `Assets_JSON_Asset__getter` | getter | g/s/m | name:string="level" | object (object) | — |
| `Core_Assets_setSingle__action` | action | g/s/m | type:string="img", name:string="priest", url:string="/public/img/priest.png" | — | Registers one lazy-loaded asset. Hidden from the editor and MCP; use specialized asset-graph registration nodes for project assets. |

### Asset registration (`assets/*.json` only)

Scope `a` = `assets/`. These are the only way to register an asset; `name` is the path inside the folder without extension (nesting kept: `buildings/castle_blue`), `ext` is the extension without dot. Registration lines are emitted before `On Start` bodies, files in alphabetical order.

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Register_Image_img__action` | action | a | name:string="priest", ext:string="png" | — | Registers `img/<name>.<ext>`; consumed by `Assets_Image_Asset__getter`. |
| `Register_Sound_audio__action` | action | a | name:string="dig", ext:string="wav" | — | Registers `audio/<name>.<ext>`; consumed by `Core_Audio_play__action`. |
| `Register_Level_maps__action` | action | a | name:string="level_1", ext:string="json" | — | Registers `maps/<name>.<ext>`; consumed by `Map_Load_Map__action`. |
| `Register_UI_Scene_ui__action` | action | a | name:string="main", ext:string="json" | — | Registers `ui/<name>.<ext>`; rendering is done by `UIScene_Load_UI_Scene__action`. |
| `Register_Model__action` | action | a | name:string="bear", ext:string="glb" | — | Registers `models/<name>.<ext>`. |

## Renderer

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Renderer_getLayer__getter` | getter | g/s/m | name:string="world" | layer (layer) | Render layer; layers described in `configs/renderer.js`. |
| `Core_Renderer_setZoom__action` | action | g/s/m | zoom:number=1 | — | — |
| `Core_Renderer_setScale__action` | action | g/s/m | scale:number=1 | — | — |
| `Core_Renderer_clear__action` | action | g/s/m |  | — | — |
| `Renderer_Clear_Layer__action` | action | g/s/m | layer:layer | — | Clears one specific layer. |
| `Renderer_Draw_Image__action` | action | g/s/m | layer:layer, texture:texture, srcX:number=0, srcY:number=0, srcW:number=0, srcH:number=0, dstX:number=0, dstY:number=0, dstW:number=128, dstH:number=128, angle:number=0, alpha:number=1 | — | Draws a texture on a webgl2D layer (usually `world`); srcX/Y/W/H is the region IN the texture (0 in srcW/H = whole texture, larger than image gets clipped); for a map-object entity, `sprite.texture` is already a cut tile — leave srcW/H at 0 and take dstW/H from `sprite.width/height`. |
| `Renderer_Viewport_Width__getter` | getter | g/s/m |  | number | Live game viewport width in pixels; read it where needed rather than caching it at startup. |
| `Renderer_Viewport_Height__getter` | getter | g/s/m |  | number | Live game viewport height in pixels. |
| `Renderer_Viewport_Aspect_Ratio__getter` | getter | g/s/m |  | number | Viewport width divided by height. |
| `Renderer_On_Viewport_Resize__event` | event | g/s/m |  | width (number), height (number), aspectRatio (number) | Fires after render layers are recalculated when the window changes size or a device rotates; it does not fire at startup. |

## Camera

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Camera_init__action` | action | g | width:number=1280, height:number=720, x:number=0, y:number=0 | — | — |
| `Core_Camera_setLerp__action` | action | g/s/m | x:number=0.1, y:number=0.1 | — | Follow smoothing per axis (0 = instant, 1 = never moves). |
| `Core_Camera_setOffset__action` | action | g/s/m | x:number=0, y:number=0 | — | — |
| `Camera_Follow__action` | action | g/s/m | x:number=0, y:number=0, delta:number=0 | — | Moves camera toward a point; `delta = 0` means instant follow. |
| `Core_Camera_isVisible__getter` | getter | g/s/m | x:number=0, y:number=0 | bool | — |
| `Camera_Camera_X__getter` | getter | g/s/m |  | number | — |
| `Camera_Camera_Y__getter` | getter | g/s/m |  | number | — |

## Inputs

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Inputs_Register_Action__action` | action | g | key:string="Space", action:string="jump" | exec | Registers a key binding and populates the `Action Pressed` list; chain registrations only, rather than wiring one from `On Start` or `On Tick`, then optionally continue setup from its output. Assign multiple keys with several nodes; choose the key with the node button. (init: true metadata, not a `fieldValues` field) |
| `Inputs_Action_Pressed__getter` | getter | g/s/m | action:string="jump" | bool | Is the action pressed; list built from `Register Action` nodes in the main file; mouse buttons (`mouseLeft`, `mouseRight`, `mouseMiddle`, `click`) are built in. |
| `Inputs_Cursor_X__getter` | getter | g/s/m |  | number | — |
| `Inputs_Cursor_Y__getter` | getter | g/s/m |  | number | — |
| `Inputs_Scroll_Delta__getter` | getter | g/s/m |  | number | — |
| `Core_Inputs_setSensitivity__action` | action | g/s/m | value:number=0.002 | — | — |
| `Core_Inputs_lockPointer__action` | action | g/s/m |  | — | — |
| `Core_Inputs_unlockPointer__action` | action | g/s/m |  | — | — |

## ECS

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Worlds_active_addEntity__action` | action | g/s/m |  | entity (entity) | Creates an empty entity in the active world; wire `Add …` nodes straight off its `entity` output (no exec chain needed), components attach right after creation. |
| `Core_Worlds_active_delEntity__action` | action | g/s/m | entity:entity | — | Removes the entity from the active world and all queries. Safe inside `For Each Entity` over the same query because that loop iterates a snapshot. |
| `Worlds_Add_Position__action` | action | g/s/m | entity:entity, x:number=0, y:number=0 | — | Position component. |
| `Worlds_Add_Sprite__action` | action | g/s/m | entity:entity, texture:texture, offsetX:number=-32, offsetY:number=-32, width:number=64, height:number=64 | — | Sprite component; `width`/`height` is on-screen draw size, `offsetX`/`offsetY` shifts from the entity position (use minus half the size to center). |
| `Worlds_Add_Collider_Circle__action` | action | g/s/m | entity:entity, radius:number=40, dynamic:bool=true | — | — |
| `Worlds_Add_Collider_Rect__action` | action | g/s/m | entity:entity, width:number=50, height:number=50, dynamic:bool=true | — | — |
| `Worlds_Mark_As_Player__action` | action | g/s/m | entity:entity | — | Player marker; entity will match the `player` query. |
| `Worlds_Add_Path__action` | action | g/s/m | entity:entity, list:array=[] | — | — |
| `Worlds_Get_Component__getter` | getter | g/s/m | entity:entity, component:string="position" | component (object) | Reads a whole component; node gets one output per field (no separate node needed per value); field list comes from the component declaration (`### component` blocks for engine, `components/*.json` for project). (dynamic: component-fields) |
| `Worlds_Get_Component_Field__getter` | getter | g/s/m | entity:entity, component:string="position", field:string="x" | value (any) | Reads one chosen component field. Hidden from the editor and MCP; component/field metadata is dynamic. |
| `Worlds_Has_Component__getter` | getter | g/s/m | entity:entity, component:string="position" | result (bool) | Whether the entity has the component. (dynamic: component-field) |
| `Worlds_Set_Component_Fields__action` | action | g/s/m | entity:entity, component:string="position" | — | Writes several component fields in one node; ports built from the chosen component (`position` → x,y; `body` → vx,vy, etc.); connected ports are written, unconnected ones are skipped (component isn't reset). Handy at the start of a system instead of many single `Set Component Field` nodes. (dynamic: component-fields-input) |
| `Worlds_Add_Component_Fields__action` | action | g/s/m | entity:entity, component:string="position" | — | Adds to several component fields in one node (connected ports add, unconnected untouched): e.g. `position.x += vx` and `position.y += vy` in one node; for a timer: `Add To Component Fields(entity, "timer", value: delta)`. (dynamic: component-fields-input) |
| `Worlds_Add_Component_Field__action` | action | g/s/m | entity:entity, component:string="position", field:string="x", amount:number=0 | — | Adds to one component field, e.g. a timer field by `delta`. Hidden from the editor and MCP; component/field metadata is dynamic. |
| `Worlds_Remove_Component__action` | action | g/s/m | entity:entity, name:string="sprite" | — | — |

## Query

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Query_add__action` | action | g/s/m | entity:entity | — | Adds the entity to all matching queries; call after all components are attached; map objects are auto-registered by the engine at load and don't need this — only graph-created entities (`Create Entity`) do. |
| `Core_Query_del__action` | action | g/s/m | entity:entity | — | — |
| `Core_Query_get__getter` | getter | g/s/m | name:string="player" | list (array) | Array of entities in a query; name is dot-joined components, e.g. `colliderCircle.sprite`. |
| `Query_First_Entity__action` | action | g/s/m | query:string="player" | found, exec → entity (entity) | First entity of a named query. `found` branch only runs if found (entity output guaranteed non-empty, safe for `Get Component`/`Collided`/etc). `For Each Entity` behaves the same (body skipped on empty query). The getter `First In Query` gives no such safety — it's inlined at every use and returns `undefined` on empty query, crashing on first component access. |
| `Query_First_In_Query__getter` | getter | g/s/m | name:string="player" | entity (entity) | First entity of a query as an EXPRESSION, no check. Returns `undefined` on empty query (component access crashes the frame); also inlined at every use site, so it's evaluated once per connection. Use only where the query is guaranteed non-empty; otherwise use `First Entity` (evaluates once, has a `found` branch). |
| `Query_Query_Count__getter` | getter | g/s/m | name:string="player" | number | — |
| `Core_Query_ySort__action` | action | g/s/m | name:string="sprite" | — | Sorts a query by `position.y` (pseudo-3D draw order). |

## Collisions

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Collisions_collided__getter` | getter | g/s/m | entityA:entity, entityB:entity | bool | Whether two entities' collision shapes overlap; if an entity is missing (empty query) the answer is `false`. |
| `Core_Collisions_update__action` | action | g/s/m | entityA:entity, entityB:entity | — | Physically separates an overlapping pair; if an entity is missing, does nothing. |
| `Collisions_Resolve_Query_Collisions__action` | action | g/s/m | queryA:string="colliderCircle", queryB:string="colliderRect" | — | Iterates all pairs from two queries and separates overlapping ones; use the same name twice to check within one query. |

## UI

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `UI_Add_UI_Node__action` | action | g | parent:uinode=null, text:string="Button", texture:texture=null, width:number=200, height:number=54, anchor:string="left-mid", left:number=0, top:number=0, fontSize:number=18, fontColor:color="#ffffff", bgColor:color="#222228", corners:number=12 | exec, onClick, onHover, onUnHover → node (uinode) | Adds a UI element; `onClick`/`onHover`/`onUnHover` branches are the callback bodies. Groups: pass another UI element as `parent` to nest inside it — `left`/`top` and percentages are then relative to the parent's rect, not the screen, so moving the parent moves everything inside; empty `parent` places the block directly on screen. |
| `UI_Set_UI_Text__action` | action | g/s/m | node:uinode, text:string="" | — | — |
| `UI_Set_UI_Texture__action` | action | g/s/m | node:uinode, texture:texture | — | — |

## UI Scene

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `UIScene_Load_UI_Scene__action` | action | g | name:string="main" | — | Reads a scene from `ui/<file>.json` and shows it; loading is async (layers/images appear a frame or two later) — hook anything depending on it to `On UI Scene Loaded`. |
| `UIScene_Load_UI_Scene_By_Name__action` | action | g/s/m | name:string="main" | — | Same as `Load UI Scene` but the name comes as a VALUE (variable/component), not typed in the field; used to switch screens (menu/pause/end); previous scene unloads immediately. |
| `UIScene_On_UI_Scene_Loaded__event` | event | g |  | — | Scene read and layers parsed; set score text and wire button handlers here. |
| `Core_UIScene_unload__action` | action | g/s/m |  | — | Removes the scene: layers forgotten, button handlers detached, render layer cleared. |
| `Core_UIScene_setVisible__action` | action | g/s/m | visible:bool=true | — | Shows/hides the whole scene; hidden scene doesn't render or catch cursor but stays loaded. |
| `Core_UIScene_setScaleMode__action` | action | g/s/m | mode:string="expand" | — | How the scene design fits the window: `expand` preserves proportions without side bars (default); `fit`, `fill`, `stretch`, and `none` are also available. |
| `UIScene_Set_UI_Scene_Layer__action` | action | g/s/m | target:layer | — | Moves the scene to another render layer; default is `ui`. |
| `UIScene_Draw_UI_Scene__action` | action | g/s/m | target:layer | — | Draws the scene right now on a given layer, for custom draw order; disable auto-draw first (`Set UI Auto Draw`) or the scene draws twice. |
| `Core_UIScene_setAutoDraw__action` | action | g/s/m | enabled:bool=true | — | Whether the scene draws automatically every frame; disable for `Draw UI Scene`. |
| `UIScene_On_UI_Click__event` | event | g | layer:any="" | node (uinode) | Click on a scene layer; empty name matches any layer. |
| `UIScene_On_UI_Hover__event` | event | g | layer:any="" | node (uinode) | Cursor entered a layer. |
| `UIScene_On_UI_Unhover__event` | event | g | layer:any="" | node (uinode) | Cursor left a layer. |
| `Core_UIScene_setText__action` | action | g/s/m | layer:any="score", string:string="" | — | Layer text; a non-empty string re-enables text disabled in the editor. |
| `Core_UIScene_setTexture__action` | action | g/s/m | layer:any="icon", texture:texture | — | Layer image; accepts a registered project image. |
| `Core_UIScene_setColor__action` | action | g/s/m | layer:any="panel", fillColor:color="#3a3f55", strokeColor:string="" | — | Layer background colors; empty string means "don't change". |
| `Core_UIScene_setTextColor__action` | action | g/s/m | layer:any="score", color:color="#ffffff" | — | — |
| `Core_UIScene_setNodeVisible__action` | action | g/s/m | layer:any="panel", visible:bool=true | — | Shows/hides one layer; hidden layer doesn't render or catch cursor — click falls through to the layer below. |
| `Core_UIScene_setSize__action` | action | g/s/m | layer:any="bar", width:number=200, height:number=80 | — | Layer size in design coordinates; an axis stretched in the editor isn't affected — it's computed from the canvas. |
| `Core_UIScene_setRotation__action` | action | g/s/m | layer:any="needle", angle:number=0 | — | Rotates a layer in degrees clockwise around its center; rotating a group rotates all its content; layout (anchors, size, `getRect`) is unaffected. |
| `Core_UIScene_getRotation__getter` | getter | g/s/m | layer:any="needle" | angle (number) | Current layer angle in degrees; used to keep spinning from where it stopped: `setRotation(l, getRotation(l) + 90*delta)`. |
| `Core_UIScene_setAnchor__action` | action | g/s/m | layer:any="bar", side:string="left", value:number=0, type:string="pixel" | — | Attaches one side of a layer; used to move a layer from gameplay (health bar, tooltip). |
| `Core_UIScene_getNode__getter` | getter | g/s/m | name:string="score" | node (uinode) | Scene layer by editor name; needed when passing the layer on as a value. |
| `Core_UIScene_getText__getter` | getter | g/s/m | layer:any="score" | text (string) | — |
| `Core_UIScene_isNodeVisible__getter` | getter | g/s/m | layer:any="panel" | visible (bool) | — |
| `Core_UIScene_isGroup__getter` | getter | g/s/m | layer:any="panel" | group (bool) | Whether this layer is a group (contains other layers). |
| `Core_UIScene_getChildren__getter` | getter | g/s/m | layer:any="panel" | layers (array) | Group content: layers bottom-to-top in draw order; empty name = layers placed directly on screen. |
| `Core_UIScene_getParent__getter` | getter | g/s/m | layer:any="score" | group (uinode) | The group containing the layer, or empty if it's directly on screen. |
| `Core_UIScene_setClip__action` | action | g/s/m | layer:any="panel", clip:bool=true | — | Whether to clip group content to its bounds; used for lists/scrollbars — content moves, only what's inside the window shows. |
| `Core_UIScene_getRect__getter` | getter | g/s/m | layer:any="panel" | rect (object) | Layer's on-screen rect in design coords: x, y, w, h; already accounts for the parent group if nested. |
| `Core_UIScene_getHovered__getter` | getter | g/s/m |  | node (uinode) | Layer currently under the cursor, or empty; used to know the cursor is over UI and skip world clicks. Only counts layers that catch the cursor. |

## Audio

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_Audio_loadSound__action` | action | g | id:string="dig", url:string="/public/audio/dig.wav" | — | Registers a sound manually; name is TYPED here, not chosen, so there's no dropdown. |
| `Core_Audio_play__action` | action | g/s/m | id:string="dig", fadeOut:bool=false, repeat:bool=false | — | — |
| `Core_Audio_stop__action` | action | g/s/m | id:string="dig" | — | — |
| `Core_Audio_pause__action` | action | g/s/m | id:string="dig" | — | — |
| `Core_Audio_resume__action` | action | g/s/m | id:string="dig" | — | — |
| `Core_Audio_setVolume__action` | action | g/s/m | id:string="dig", volume:number=1 | — | — |
| `Core_Audio_setGlobalVolume__action` | action | g/s/m | volume:number=1 | — | — |
| `Core_Audio_changePitch__action` | action | g/s/m | id:string="dig", pitch:number=1 | — | — |
| `Core_Audio_enableRandomPitch__action` | action | g/s/m | id:string="dig" | — | — |
| `Core_Audio_muteAll__action` | action | g/s/m |  | — | — |
| `Core_Audio_unmuteAll__action` | action | g/s/m |  | — | — |

## AStar

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Core_AStar_init__action` | action | g | rows:number=32, cols:number=32, cellSize:number=32, offsetX:number=-512, offsetY:number=-512 | — | Builds the pathfinding grid. |
| `Core_AStar_setObject__action` | action | g/s/m | entity:entity | — | — |
| `Core_AStar_removeObject__action` | action | g/s/m | entity:entity | — | — |
| `Core_AStar_selectCell__getter` | getter | g/s/m | startX:number=0, startY:number=0, endX:number=0, endY:number=0, ignoreEntityIds:array=[] | path (array) | Path as an array of `{ row, col }`. |

## VFX

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `VFX_Add_Emitter__action` | action | g | name:string="explosion", texture:texture, mode:string="once", count:number=32, rate:number=30, lifetime:number=0.8, shape:string="circle", shapeRadius:number=16, angle:number=0, spread:number=3.14159, speedMin:number=60, speedMax:number=160, gravityX:number=0, gravityY:number=0, damping:number=1, sizeStart:number=24, sizeEnd:number=4, opacityStart:number=1, opacityEnd:number=0 | — | Registers an effect template; doesn't spawn particles itself — trigger via `Play Emitter` (`once`) or `Start Emitter` (`loop`). |
| `VFX_Play_Emitter__action` | action | g/s/m | name:string="explosion", x:number=0, y:number=0 | — | Starts an independent instance of a template at a point; for `mode: once` the instance self-removes once particles die out. |
| `Core_VFX_start__action` | action | g/s/m | name:string="smoke" | — | — |
| `Core_VFX_stop__action` | action | g/s/m | name:string="smoke" | — | — |
| `Core_VFX_reset__action` | action | g/s/m | name:string="smoke" | — | — |
| `Core_VFX_remove__action` | action | g/s/m | name:string="smoke" | — | — |
| `VFX_Set_Emitter_Position__action` | action | g/s/m | name:string="smoke", x:number=0, y:number=0 | — | — |
| `VFX_Burst__action` | action | g/s/m | name:string="smoke", x:number=0, y:number=0, count:number=16 | — | One-off particle burst on an existing emitter. |
| `Core_VFX_has__getter` | getter | g/s/m | name:string="smoke" | bool | — |
| `VFX_Draw_All_Particles__action` | action | g/s/m | layer:layer | — | Draws all emitters' particles on a webgl2D layer; engine doesn't auto-draw particles — call this each frame. |

## Map

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Map_Load_Map__action` | action | g | name:string="level_1" | — | Reads a map from `maps/<file>.json` and populates the world; loading is async (tilesets/objects appear a frame or two later) — hook dependents to `On Map Loaded`. |
| `Map_Load_Map_By_Name__action` | action | g/s/m | name:string="level_1" | — | Same as `Load Map` but the name comes as a VALUE (component/variable/query); used for level transitions where the next map is stored on an object; async, unloads the current map first — its object entities vanish immediately, new ones appear a frame or two later. |
| `Map_On_Map_Loaded__event` | event | g |  | — | Map read, its objects created and registered in queries; set player spawn, attach sprite/components to map objects, do anything needing map size. Fires after `On Start` once `Load Map` finishes (a frame or two later); before that `Get Map Object` returns null. |
| `Map_Draw_Map_Below__action` | action | g/s/m | layer:layer | — | Tile layers BELOW the "entities" layer (background under entities); call before drawing entities. |
| `Map_Draw_Map_Above__action` | action | g/s/m | layer:layer | — | Tile layers ABOVE "entities" (canopies, roofs, rocks entities go behind); call after drawing entities. |
| `Map_Draw_Map__action` | action | g/s/m | layer:layer | — | Whole map in one call — when entities draw on top of everything and layers don't need splitting. |
| `Core_Map_setOffset__action` | action | g/s/m | x:number=0, y:number=0 | — | Where cell (0,0) lands in the world; default is the origin. |
| `Core_Map_unload__action` | action | g/s/m |  | — | Removes the map: its object entities leave the world and queries. |
| `Core_Map_getEntity__getter` | getter | g/s/m | name:string="spawn" | entity (entity) | Map object entity by its editor name; used to find spawn points, doors, triggers. Returns null before `On Map Loaded` — map loads async but systems/`On Tick` run from frame 1. Do one-off object setup in `On Map Loaded`; in a system, fetch the entity via a query (`For Each Entity`/`First Entity`) or check the output with `Is Valid`. |
| `Core_Map_hasTile__getter` | getter | g/s/m | col:number=0, row:number=0, layerName:string="" | has (bool) | Whether a cell has a tile; without a layer name, checks any layer of the map. |
| `Core_Map_worldToCell__getter` | getter | g/s/m | x:number=0, y:number=0 | cell (object) | Cell `{ col, row }` under a world point. |
| `Core_Map_cellToWorld__getter` | getter | g/s/m | col:number=0, row:number=0 | point (vector2) | Cell center in world coords `{ x, y }`. |
| `Map_Map_Size__getter` | getter | g/s/m |  | size (object) | Map size in cells and in world pixels. |

## Streams

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Streams_On_Chat_Message__event` | event | g |  | provider (string), author (string), message (string) | Stream chat message (twitch / vklive / goodgame). |

## Flow

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Branch__action` | action | g/s/m | condition:bool=true | true, false | Conditional branch. |
| `Sequence__action` | action | g/s/m | outputs:number=4 | then0…thenN (2–8) | Runs branches top to bottom. `outputs` dynamically selects 2–8 branches; reducing it removes the excess branch connections. |
| `Reroute__getter` | getter | g/s/m | value:any=null | out (any) | A waypoint on a wire: computes nothing and doesn't appear in code — the value is inlined at the use site as if it weren't there; purely visual, to break up a long wire; add with Alt+click on a wire, type/color inherited from the source. |
| `For_Loop__action` | action | g/s/m | count:number=10 | body, exec → index (number) | Counter loop from 0 to `count - 1`. |
| `For_Each_Entity__action` | action | g/s/m | query:string="player" | body, exec → entity (entity), index (number) | Iterates a snapshot of the query. Destroying or unregistering in `body` does not disrupt iteration; entities added during it appear next frame. `Break` may end the loop. |
| `For_Each_Item__action` | action | g/s/m | array:array=[] | body, exec → item (any), index (number) | Iterates array elements; `body` is skipped for an empty array. `Break` may end the loop. |
| `Break__action` | action | g/s/m |  | none | Immediately exits a containing `For Loop` or `For Each` body. It is invalid outside a loop and has no `exec` output. |
| `Do_Once__action` | action | g |  | body, exec | Runs the `body` branch once for the whole game session; stores a flag in a module variable, so only available in the main file (a system file is a single function, nothing can live outside it). |
| `On_Interval__action` | action | g | seconds:number=1, delta:number=0 | body, exec | Runs `body` no more often than once per `seconds` seconds. Put inside `On Tick` — take `delta` from `On Tick`'s output. Accumulates time in a module variable, so only available in the main file; in a system, keep the timer in a component field (`Add To Component Fields`/`Set Component Fields`). |

## Variables

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Set_Variable__action` | action | g | name:string="score", value:any=0 | — | Writes a global game variable; the variable is declared by the compiler automatically. |
| `Get_Variable__getter` | getter | g | name:string="score" | value (any) | — |

## Values

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Number__getter` | getter | g/s/m | value:number=0 | value (number) | — |
| `String__getter` | getter | g/s/m | value:string="" | value (string) | — |
| `Concat__getter` | getter | g/s/m | a:any="", b:any="" | result (string) | Joins two values into a string: "Score: " + 3 → "Score: 3"; numbers/bools auto-convert; chain `Concat` for 3+ parts. |
| `To_String__getter` | getter | g/s/m | value:any=0 | result (string) | Number or bool as a string, for `Set UI Text`/`Set UI Layer Text`. |
| `Boolean__getter` | getter | g/s/m | value:bool=true | value (bool) | — |
| `Color__getter` | getter | g/s/m | value:color="#ffffff" | value (color) | — |
| `Make_Vector2__getter` | getter | g/s/m | x:number=0, y:number=0 | vector (vector2) | — |
| `Vector2_X__getter` | getter | g/s/m | vector:vector2 | x (number) | — |
| `Vector2_Y__getter` | getter | g/s/m | vector:vector2 | y (number) | — |
| `Vector2_Multiply__getter` | getter | g/s/m | vector:vector2, by:number=1 | result (vector2) | Multiplies both vector coordinates by a scalar. |
| `Vector2_Divide__getter` | getter | g/s/m | vector:vector2, by:number=1 | result (vector2) | Divides both vector coordinates by a scalar; division by zero returns `{ x: 0, y: 0 }`. |

## Arrays

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Make_Array__getter` | getter | g/s/m | items:array=[] | array (array) | Creates an array; enter initial values as an array literal. |
| `Array_Length__getter` | getter | g/s/m | array:array=[] | length (number) | Number of elements. |
| `Array_Item__getter` | getter | g/s/m | array:array=[], index:number=0 | item (any) | Zero-based item lookup; out-of-range results are empty, so validate entity results. |
| `Array_Has__getter` | getter | g/s/m | array:array=[], value:any=0 | result (bool) | Whether the array includes the value. |
| `Array_Push__action` | action | g/s/m | array:array=[], value:any=0 | — | Appends a value. The `array` input must be linked to the stored array being changed. |
| `Array_Set__action` | action | g/s/m | array:array=[], index:number=0, value:any=0 | — | Replaces an item by index. The `array` input must be linked to the stored array being changed. |
| `Array_Remove_At__action` | action | g/s/m | array:array=[], index:number=0 | — | Removes an item by index and shifts later items left. The `array` input must be linked to the stored array being changed. |

## Operators

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Add__getter` | getter | g/s/m | a:number=0, b:number=0 | result (number) | — |
| `Subtract__getter` | getter | g/s/m | a:number=0, b:number=0 | result (number) | — |
| `Multiply__getter` | getter | g/s/m | a:number=1, b:number=1 | result (number) | — |
| `Divide__getter` | getter | g/s/m | a:number=1, b:number=1 | result (number) | — |
| `Modulo__getter` | getter | g/s/m | a:number=0, b:number=1 | result (number) | — |
| `Negate__getter` | getter | g/s/m | a:number=0 | result (number) | — |
| `Min__getter` | getter | g/s/m | a:number=0, b:number=0 | result (number) | — |
| `Max__getter` | getter | g/s/m | a:number=0, b:number=0 | result (number) | — |
| `Clamp__getter` | getter | g/s/m | value:number=0, min:number=0, max:number=1 | result (number) | — |
| `Abs__getter` | getter | g/s/m | a:number=0 | result (number) | — |
| `Floor__getter` | getter | g/s/m | a:number=0 | result (number) | — |
| `Round__getter` | getter | g/s/m | a:number=0 | result (number) | — |
| `Sqrt__getter` | getter | g/s/m | a:number=0 | result (number) | — |
| `Sin__getter` | getter | g/s/m | a:number=0 | result (number) | — |
| `Cos__getter` | getter | g/s/m | a:number=0 | result (number) | — |
| `Equal__getter` | getter | g/s/m | a:any=0, b:any=0 | result (bool) | — |
| `Not_Equal__getter` | getter | g/s/m | a:any=0, b:any=0 | result (bool) | — |
| `Greater__getter` | getter | g/s/m | a:number=0, b:number=0 | result (bool) | — |
| `Greater_Or_Equal__getter` | getter | g/s/m | a:number=0, b:number=0 | result (bool) | — |
| `Less__getter` | getter | g/s/m | a:number=0, b:number=0 | result (bool) | — |
| `Less_Or_Equal__getter` | getter | g/s/m | a:number=0, b:number=0 | result (bool) | — |
| `And__getter` | getter | g/s/m | a:bool=true, b:bool=true | result (bool) | — |
| `Or__getter` | getter | g/s/m | a:bool=false, b:bool=false | result (bool) | — |
| `Not__getter` | getter | g/s/m | a:bool=false | result (bool) | — |
| `Select__getter` | getter | g/s/m | condition:bool=true, ifTrue:any=1, ifFalse:any=0 | result (any) | Ternary: `condition ? ifTrue : ifFalse`. |
| `Is_Valid__getter` | getter | g/s/m | value:any=null | result (bool) | Checks the value isn't `null` or `undefined`. |

## Debug

| schemaId | kind | scopes | params | flow → outs | note |
|---|---|---|---|---|---|
| `Print__action` | action | g/s/m | label:string="log", value:any=0 | — | Prints a value to the browser console. |
