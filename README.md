# boonan-skill

An [Agent Skill](https://agentskills.io) for editing and building games on
[boonan.io](https://boonan.io) without a browser. Ships a headless socket.io
CLI (`scripts/cli.js`) plus the platform knowledge an agent needs to use it
safely: optimistic locking with `baseVersion`, `--expect` guards, graph
validation, and a list of known pitfalls.

Works with any agent runtime that supports the SKILL.md format
(Claude Code, OpenCode, Codex, ...).

## Install

Clone into your agent's skills directory:

```sh
# OpenCode (project-local)
git clone https://github.com/kurbezz/boonan-skill .opencode/skills/boonan

# Claude Code (user-level)
git clone https://github.com/kurbezz/boonan-skill ~/.claude/skills/boonan

# Codex
git clone https://github.com/kurbezz/boonan-skill ~/.agents/skills/boonan
```

Then install the CLI dependency:

```sh
cd <skills-dir>/boonan/scripts && npm install
```

## Usage

```sh
export BOONAN_COOKIE='connect.sid=...; gid=...'   # copy from browser DevTools
export BOONAN_PROJECT='<project uuid>'

node scripts/cli.js ls
node scripts/cli.js nodes systems move.json --value 40
node scripts/cli.js set systems move.json n_xxx fieldValues.value 100 --expect 40
node scripts/cli.js add-node systems move.json For_Each_Entity__action --fields '{"query":"player"}'
node scripts/cli.js link systems move.json n_a exec n_b exec
node scripts/cli.js upload img/Tilesets ./grass.png --register
node scripts/cli.js map new level_1 --register
node scripts/cli.js ui add-layer hud.json --json '{"name":"score"}'
node scripts/cli.js build "My Game"
```

See [SKILL.md](SKILL.md) for the workflow and
[reference/protocol.md](reference/protocol.md) for the wire protocol.

## Layout

```
SKILL.md                    agent instructions (loaded by the runtime)
reference/nodes.md          all 199 node schemas: params, ports, behaviour
reference/graph-format.md   node/link JSON shape, scopes, component files
reference/recipes.md        ECS model + step-by-step node chains
reference/assets.md         binary upload + asset registration
reference/map.md            tile map JSON + map commands
reference/ui-scene.md       UI scene JSON + ui commands
reference/protocol.md       socket.io events, headers, versioning
reference/verifying.md      screenshot-based verification
scripts/cli.js              command-line entry point
scripts/client.js           Boonan class + graph helpers (reusable from Node)
scripts/upload.js           magic-byte checks, upload, size verification, registration
scripts/map.js              map model: tilesets, cells, objects, validation
scripts/ui-scene.js         UI scene model: layer defaults, validation
```

## License

MIT
