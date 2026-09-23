# Graph file format

Every graph file (`game.json`, `systems/*.json`, `modules/*.json`,
`components/*.json`, `assets/*.json`) is a JSON object with exactly two keys. The server
rejects any other root key.

```json
{
  "nodes": [
    { "id": "n_1", "schemaId": "On_System_Update__event", "x": 80, "y": 120, "fieldValues": {} },
    { "id": "n_2", "schemaId": "For_Each_Entity__action", "x": 360, "y": 120,
      "fieldValues": { "query": "player" } }
  ],
  "links": [
    { "id": "l_1", "fromNode": "n_1", "fromPort": "exec", "toNode": "n_2", "toPort": "exec" }
  ]
}
```

## Node

| field | type | notes |
|---|---|---|
| `id` | string | Any unique string. Editor generates `<prefix>_<counter>`; `n_...` is conventional |
| `schemaId` | string | `[A-Za-z0-9_]+`, see [nodes.md](nodes.md). Suffix encodes kind: `__event`, `__action`, `__getter` |
| `x`, `y` | number | Editor canvas position; irrelevant at runtime, default `0` |
| `fieldValues` | object | Literal value for every input port that has no incoming link, keyed by port name |

Unknown node fields are dropped by the editor normaliser; do not rely on them.

## Link

| field | notes |
|---|---|
| `id` | optional; the editor assigns `l_<n>` if missing |
| `fromNode` / `toNode` | must reference existing node ids, otherwise the file is rejected |
| `fromPort` / `toPort` | port names, non-empty |

Flow links connect an output flow port (`exec`, `true`, `body`, `found`, ...)
to the target's `exec` input. Data links connect a getter output (or an
action's data output such as `entity`, `delta`) to a named data input.

## Ports

- **Actions** have an implicit flow input `exec` and one or more flow outputs
  (default `exec`). Data outputs, if any, are listed in nodes.md.
- **Getters** have no flow ports; they are inlined as expressions wherever
  their output is linked. A getter on an empty query yields `undefined` and
  crashes the frame - prefer actions with a guarded branch (`First Entity` →
  `found`).
- **Events** are graph roots: `On_Start__event`, `On_Tick__event` (game),
  `On_System_Update__event` (system), `Component__event` (component).
- **Dynamic ports**: `Get Component` exposes one output per property of the
  component named in `fieldValues.component` (`x`, `y`, `texture`, ...).
  `Set/Add Component Fields` expose one input per property.

Data port types: `number`, `string`, `bool`, `color`, `vector2`, `texture`,
`entity`, `object`, `array`, `layer`, `uinode`, `any`.

## Scope by folder

| folder | scope | root event |
|---|---|---|
| `game.json` | `game` | `On_Start__event`, `On_Tick__event` |
| `systems/` | `system` | `On_System_Update__event` (outputs `delta`) |
| `modules/` | `module` | `Module__event`, `Method__event` |
| `components/` | `component` | `Component__event` |
| `assets/` | `assets` | none - flat list of `Register_*__action` nodes, see nodes.md |

Each schema lists the scopes it is allowed in (nodes.md column `scopes`).
Variables (`Set/Get Variable`) are only available in `game` scope.

## Component file

`components/<name>.json` defines component `<name>`. It is a graph with a
single `Component__event` node whose `fieldValues.properties` is an array:

```json
{
  "nodes": [{
    "id": "n_1", "schemaId": "Component__event", "x": 0, "y": 0,
    "fieldValues": {
      "properties": [
        { "name": "hp",    "type": "number", "default": 100 },
        { "name": "label", "type": "string", "default": "" }
      ]
    }
  }],
  "links": []
}
```

Property `type` is one of `number`, `string`, `bool`, `array`; anything else
falls back to `number`. Property names must be valid identifiers.
After saving, `Get Component` / `Set Component Fields` with
`component: "<name>"` expose these properties as ports.

## Registering a system

A system file does nothing until `game.json` contains an
`Add_System__action` node with `fieldValues.file = "<name>.json"` linked
into the `On_Start__event` chain. The order of `Add System` nodes in that
chain is the per-frame execution order.
