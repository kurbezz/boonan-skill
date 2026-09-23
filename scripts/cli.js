#!/usr/bin/env node
'use strict';
/**
 * boonan CLI — for the agent. Every command prints JSON to stdout.
 * Errors: JSON on stdout + exit code 1. Nothing else goes to stdout.
 *
 *   export BOONAN_COOKIE='connect.sid=...; gid=...'
 *   export BOONAN_PROJECT='0829174f-...'
 *
 *   boonan ls [--json]
 *   boonan cat <folder> <file>
 *   boonan nodes <folder> <file> [--grep RE] [--schema RE] [--value N]
 *   boonan trace <folder> <file> <nodeId> [--depth N]
 *   boonan set <folder> <file> <nodeId> <key> <value> [--expect V]
 *   boonan batch <file.json>
 *   boonan put <folder> <file> <local.json>            — replace whole graph
 *   boonan new <folder> <file>                          — create an empty graph
 *   boonan rm <folder> <file>                           — delete a file
 *   boonan mv <folder> <old> <new>                      — rename a file
 *   boonan add-node <folder> <file> <schemaId> [--id ID] [--x N] [--y N] [--fields '{"query":"player"}']
 *   boonan rm-node <folder> <file> <nodeId>
 *   boonan link <folder> <file> <fromNode> <fromPort> <toNode> <toPort>
 *   boonan unlink <folder> <file> <fromNode> <fromPort> <toNode> <toPort>
 *   boonan build [title]
 *   boonan url
 *
 *   boonan ui new <file> [--width N] [--height N]
 *   boonan ui validate <file|local.json> [--local]
 *   boonan ui layers <file>
 *   boonan ui add-layer <file> [--parent ID] [--json '{...partial...}']
 *   boonan ui set <file> <layerIdOrName> <key.path> <value> [--expect V]
 *   boonan ui rm-layer <file> <layerIdOrName> [--recursive]
 *   boonan ui put <file> <local.json>
 *
 *   boonan map new <file> [--cols N] [--rows N] [--tile N] [--register]
 *   boonan map info <file>
 *   boonan map validate <file> [--local]
 *   boonan map show <file> [--layer L]
 *   boonan map add-tileset <file> <img path> --cell N [--local ./x.png] [--w N --h N]
 *   boonan map tile <file> <layer> <x> <y> <tileset> <tile>
 *   boonan map erase <file> <layer> <x> <y>
 *   boonan map fill <file> <layer> <x0> <y0> <x1> <y1> <tileset> <tile>
 *   boonan map resize <file> <cols> <rows>
 *   boonan map add-layer <file> <name> [--type tiles|objects|entities]
 *   boonan map rm-layer <file> <layer>
 *   boonan map objects <file>
 *   boonan map object <file> <name> [--x N --y N --w N --h N] [--def ID] [--json '{...}']
 *   boonan map rm-object <file> <name>
 *   boonan map put <file> <local.json>
 *   boonan map get <file> [--out path]
 *   boonan map register <file>
 *
 *   boonan upload <folder> <local file> [--as NAME] [--register] [--encoding binary|buffer] [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { Boonan, BoonanError, addNode, addLink, removeLink, removeNode } = require('./client');
const { validateScene, makeScene, makeLayer, findLayer, setPath } = require('./ui-scene');
const mapLib = require('./map');
const uploadLib = require('./upload');

const out = (o) => { process.stdout.write(JSON.stringify(o, null, 2) + '\n'); };
const die = (msg, code = 'error', extra) => {
  out({ ok: false, error: msg, code, ...(extra || {}) });
  process.exit(1);
};

function parseFlags(argv) {
  const flags = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i];
      else flags[a.slice(2)] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

/** "12" -> 12, "true" -> true, "null" -> null, otherwise string or JSON */
function coerce(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw !== '' && !isNaN(Number(raw))) return Number(raw);
  if (/^[[{"]/.test(raw)) { try { return JSON.parse(raw); } catch (_) {} }
  return raw;
}

function readAt(node, key) {
  return String(key).split('.').reduce((o, k) => (o == null ? o : o[k]), node);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();
  const { flags, rest } = parseFlags(argv);

  if (!cmd || cmd === 'help' || flags.help) {
    out({
      ok: true,
      usage: [
        'boonan ls                                   — project files',
        'boonan cat <folder> <file>                  — content + version',
        'boonan nodes <folder> <file> [--grep RE] [--schema RE] [--value N]',
        'boonan trace <folder> <file> <nodeId> [--depth N] — node relations',
        'boonan set <folder> <file> <nodeId> <key> <value> [--expect V]',
        'boonan batch <edits.json>                   — batch of edits (op: set|add-node|link|unlink|rm-node)',
        'boonan put <folder> <file> <local.json>     — replace whole graph',
        'boonan new <folder> <file>                  — create an empty graph {"nodes":[],"links":[]}',
        'boonan rm <folder> <file>                   — delete a file',
        'boonan mv <folder> <old> <new>              — rename a file',
        'boonan add-node <folder> <file> <schemaId> [--id ID] [--x N] [--y N] [--fields \'{"query":"player"}\']',
        'boonan rm-node <folder> <file> <nodeId>     — remove a node and its links',
        'boonan link <folder> <file> <fromNode> <fromPort> <toNode> <toPort>',
        'boonan unlink <folder> <file> <fromNode> <fromPort> <toNode> <toPort>',
        'boonan build [title]                        — build the project',
        'boonan url                                  — game link',
        '',
        'boonan upload <folder> <local file> [--as NAME] [--register] [--encoding binary|buffer] [--dry-run]',
        '                                            — upload a binary (img/, audio/, ui/img); default encoding is binary; --register adds the assets/*.json node',
        '',
        'boonan ui new <file> [--width N] [--height N]      — create an empty UI scene in ui/',
        'boonan ui validate <file|local.json> [--local]     — validate a remote ui/<file> or, with --local, a local path',
        'boonan ui layers <file>                            — list layers {id, name, parent, isGroup, text, texture}',
        'boonan ui add-layer <file> [--parent ID] [--json \'{...}\'] — append a layer',
        'boonan ui set <file> <layerIdOrName> <key.path> <value> [--expect V]',
        'boonan ui rm-layer <file> <layerIdOrName> [--recursive]   — remove a layer (and descendants with --recursive)',
        'boonan ui put <file> <local.json>                  — replace a whole UI scene',
        '',
        'boonan map new <file> [--cols N] [--rows N] [--tile N] [--register] — create an empty map in maps/',
        'boonan map info <file>                             — size, layers, tilesets, objects count',
        'boonan map validate <file|local.json> [--local]    — validate a remote maps/<file> or, with --local, a local path',
        'boonan map show <file> [--layer L]                 — render an ASCII grid of a layer',
        'boonan map add-tileset <file> <img e.g. img/Tilesets/grass.png> --cell N [--local ./grass.png] [--w N --h N]',
        'boonan map tile <file> <layer> <x> <y> <tileset> <tile>   — set one tile cell',
        'boonan map erase <file> <layer> <x> <y>            — erase one tile cell',
        'boonan map fill <file> <layer> <x0> <y0> <x1> <y1> <tileset> <tile> — fill a rect (inclusive, clipped)',
        'boonan map resize <file> <cols> <rows>              — resize the map, dropping out-of-bounds cells',
        'boonan map add-layer <file> <name> [--type tiles|objects|entities]',
        'boonan map rm-layer <file> <layer>                 — remove a layer by id or name',
        'boonan map objects <file>                          — list objects {name,x,y,w,h,defId,sprite,components}',
        'boonan map object <file> <name> [--x N --y N --w N --h N] [--def ID] [--json \'{...}\'] — upsert an object by name',
        'boonan map rm-object <file> <name>                 — remove an object by name',
        'boonan map put <file> <local.json>                 — replace a whole map',
        'boonan map get <file> [--out path]                 — write a local copy for bulk edits',
        'boonan map register <file>                         — ensure the map is registered via Register_Level_maps__action',
      ],
      env: ['BOONAN_COOKIE', 'BOONAN_PROJECT'],
      batchFormat: [
        { op: 'set', folder: 'systems', file: 'x.json', nodeId: 'n_1', key: 'fieldValues.value', value: 100, expect: 40 },
        { op: 'add-node', folder: 'systems', file: 'x.json', schemaId: 'Number', x: 0, y: 0, fieldValues: { value: 1 } },
        { op: 'link', folder: 'systems', file: 'x.json', fromNode: 'n_1', fromPort: 'out', toNode: 'n_2', toPort: 'in' },
        { op: 'unlink', folder: 'systems', file: 'x.json', fromNode: 'n_1', fromPort: 'out', toNode: 'n_2', toPort: 'in' },
        { op: 'rm-node', folder: 'systems', file: 'x.json', nodeId: 'n_1' },
      ],
    });
    return;
  }

  // Offline operations: no cookie needed.
  if (cmd === 'upload' && flags['dry-run']) return uploadMain(rest, flags);
  if ((cmd === 'ui' || cmd === 'map') && rest[0] === 'validate' && flags.local) {
    const sub = rest.shift();
    return cmd === 'ui' ? uiMain(sub, rest, flags) : mapMain(sub, rest, flags);
  }

  const cookie = process.env.BOONAN_COOKIE;
  const project = process.env.BOONAN_PROJECT;
  if (!cookie) die('BOONAN_COOKIE is not set', 'no_cookie');
  if (!project) die('BOONAN_PROJECT is not set', 'no_project');

  if (cmd === 'url') {
    out({ ok: true, url: `https://boonan.io/projects/${project}/build/index.html` });
    return;
  }

  if (cmd === 'ui') {
    const sub = rest.shift();
    return uiMain(sub, rest, flags);
  }

  if (cmd === 'map') {
    const sub = rest.shift();
    return mapMain(sub, rest, flags);
  }

  if (cmd === 'upload') return uploadMain(rest, flags);

  const b = new Boonan({ cookie, project });
  await b.connect();

  try {
    switch (cmd) {
      case 'ls': {
        const files = await b.listFiles();
        const graphs = files.filter(f => f.path.endsWith('.json') && !f.path.startsWith('build/'));
        out({ ok: true, total: files.length, graphs, totalBytes: files.reduce((s, f) => s + (f.size || 0), 0) });
        break;
      }
      case 'cat': {
        const [folder, file] = rest;
        if (!file) die('usage: <folder> <file>', 'bad_args');
        const f = await b.readFile(folder, file);
        out({ ok: true, folder, file, version: f.version, bytes: f.content.length, content: f.content });
        break;
      }
      case 'nodes': {
        const [folder, file] = rest;
        if (!file) die('usage: <folder> <file>', 'bad_args');
        const { graph, version } = await b.readGraph(folder, file);
        let nodes = graph.nodes || [];
        if (flags.schema) { const re = new RegExp(flags.schema, 'i'); nodes = nodes.filter(n => re.test(n.schemaId || '')); }
        if (flags.grep) { const re = new RegExp(flags.grep, 'i'); nodes = nodes.filter(n => re.test(JSON.stringify(n))); }
        if (flags.value !== undefined) {
          const want = coerce(String(flags.value));
          nodes = nodes.filter(n => Object.values(n.fieldValues || {}).some(v => v === want));
        }
        out({ ok: true, folder, file, version, matched: nodes.length, total: (graph.nodes || []).length,
              nodes: nodes.map(n => ({ id: n.id, schemaId: n.schemaId, fieldValues: n.fieldValues })) });
        break;
      }
      case 'trace': {
        const [folder, file, nodeId] = rest;
        if (!nodeId) die('usage: <folder> <file> <nodeId>', 'bad_args');
        const depth = Number(flags.depth || 4);
        const { graph } = await b.readGraph(folder, file);
        const byId = Object.fromEntries((graph.nodes || []).map(n => [n.id, n]));
        if (!byId[nodeId]) die(`node not found: ${nodeId}`, 'not_found');
        const links = graph.links || [];
        const ins = links.filter(l => l.toNode === nodeId).map(l => ({
          port: l.toPort, from: l.fromNode, schemaId: (byId[l.fromNode] || {}).schemaId,
          fieldValues: (byId[l.fromNode] || {}).fieldValues }));
        const chain = [];
        let frontier = [nodeId]; const seen = new Set();
        for (let d = 0; d < depth && frontier.length; d++) {
          const next = [];
          for (const id of frontier) {
            if (seen.has(id)) continue; seen.add(id);
            const n = byId[id]; if (!n) continue;
            if (d > 0) chain.push({ depth: d, id, schemaId: n.schemaId, fieldValues: n.fieldValues });
            links.filter(l => l.fromNode === id).forEach(l => next.push(l.toNode));
          }
          frontier = next;
        }
        out({ ok: true, node: { id: nodeId, schemaId: byId[nodeId].schemaId, fieldValues: byId[nodeId].fieldValues }, inputs: ins, downstream: chain });
        break;
      }
      case 'set': {
        const [folder, file, nodeId, key, value] = rest;
        if (value === undefined) die('usage: <folder> <file> <nodeId> <key> <value>', 'bad_args');
        const edit = { nodeId, key, value: coerce(value) };
        if (flags.expect !== undefined) edit.expect = coerce(String(flags.expect));
        const r = await b.setNodeFields(folder, file, [edit]);
        out({ ok: true, ...r });
        break;
      }
      case 'batch': {
        const [path] = rest;
        if (!path) die('usage: <edits.json>', 'bad_args');
        let edits;
        try { edits = JSON.parse(fs.readFileSync(path, 'utf8')); }
        catch (e) { die(`could not read ${path}: ${e.message}`, 'bad_file'); }
        if (!Array.isArray(edits)) die('expected an array of edits', 'bad_format');
        // group by file: one read+write per file
        const groups = new Map();
        for (const e of edits) {
          const k = `${e.folder}|${e.file}`;
          if (!groups.has(k)) groups.set(k, { folder: e.folder, file: e.file, ops: [] });
          groups.get(k).ops.push({ op: e.op || 'set', ...e });
        }
        const results = [];
        for (const g of groups.values()) {
          const applied = [], missing = [], unchanged = [];
          try {
            const r = await b.edit(g.folder, g.file, (graph) => {
              for (const e of g.ops) {
                switch (e.op) {
                  case 'set': {
                    const node = (graph.nodes || []).find(n => n.id === e.nodeId);
                    if (!node) { missing.push(e.nodeId); break; }
                    const path = String(e.key).split('.');
                    let obj = node;
                    for (let i = 0; i < path.length - 1; i++) {
                      if (obj[path[i]] == null) obj[path[i]] = {};
                      obj = obj[path[i]];
                    }
                    const leaf = path[path.length - 1];
                    const was = obj[leaf];
                    if (e.expect !== undefined && was !== e.expect) {
                      throw new BoonanError(`${e.nodeId}.${e.key}: expected ${JSON.stringify(e.expect)}, found ${JSON.stringify(was)} in file`, 'expect_mismatch');
                    }
                    if (was === e.value) { unchanged.push({ nodeId: e.nodeId, key: e.key, value: e.value }); break; }
                    obj[leaf] = e.value;
                    applied.push({ op: 'set', nodeId: e.nodeId, key: e.key, from: was, to: e.value });
                    break;
                  }
                  case 'add-node': {
                    const node = addNode(graph, { id: e.id, schemaId: e.schemaId, x: e.x, y: e.y, fieldValues: e.fieldValues });
                    applied.push({ op: 'add-node', id: node.id, schemaId: node.schemaId });
                    break;
                  }
                  case 'link': {
                    const link = addLink(graph, { fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort });
                    applied.push({ op: 'link', fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort, duplicate: !!link.duplicate });
                    break;
                  }
                  case 'unlink': {
                    const n = removeLink(graph, { fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort });
                    applied.push({ op: 'unlink', fromNode: e.fromNode, fromPort: e.fromPort, toNode: e.toNode, toPort: e.toPort, removed: n });
                    break;
                  }
                  case 'rm-node': {
                    const r2 = removeNode(graph, e.nodeId);
                    applied.push({ op: 'rm-node', nodeId: e.nodeId, removed: r2.removed, linksRemoved: r2.linksRemoved });
                    break;
                  }
                  default:
                    throw new BoonanError(`unknown batch op: ${e.op}`, 'bad_op');
                }
              }
            });
            results.push({ file: `${g.folder}/${g.file}`, ok: true, applied, missing, unchanged, version: r.version });
          } catch (e) {
            results.push({ file: `${g.folder}/${g.file}`, ok: false, error: e.message, code: e.code, applied, missing, unchanged });
          }
        }
        const failed = results.filter(r => !r.ok).length;
        out({ ok: failed === 0, files: results.length, failed, results });
        if (failed) process.exitCode = 1;
        break;
      }
      case 'put': {
        const [folder, file, localPath] = rest;
        if (!localPath) die('usage: <folder> <file> <local.json>', 'bad_args');
        let graph;
        try { graph = JSON.parse(fs.readFileSync(localPath, 'utf8')); }
        catch (e) { die(`could not read ${localPath}: ${e.message}`, 'bad_file'); }
        const version = b._versions.get(`${folder}|${file}`);
        let base = version;
        if (base === undefined) {
          try { const f = await b.readFile(folder, file); base = f.version; } catch (_) {}
        }
        const r = await b.writeGraph(folder, file, graph, { baseVersion: base });
        out({ ok: true, folder, file, version: r.version, nodes: (graph.nodes || []).length, links: (graph.links || []).length });
        break;
      }
      case 'new': {
        const [folder, file] = rest;
        if (!file) die('usage: <folder> <file>', 'bad_args');
        const graph = { nodes: [], links: [] };
        const r = await b.createFile(folder, file, JSON.stringify(graph, null, 2));
        out({ ok: true, folder, file, version: r.version });
        break;
      }
      case 'rm': {
        const [folder, file] = rest;
        if (!file) die('usage: <folder> <file>', 'bad_args');
        const r = await b.deleteFile(folder, file);
        out({ ok: true, folder, file, deleted: true });
        break;
      }
      case 'mv': {
        const [folder, oldName, newName] = rest;
        if (!newName) die('usage: <folder> <old> <new>', 'bad_args');
        const r = await b.renameFile(folder, oldName, newName);
        out({ ok: true, folder, oldName, newName, version: r.version });
        break;
      }
      case 'add-node': {
        const [folder, file, schemaId] = rest;
        if (!schemaId) die('usage: <folder> <file> <schemaId>', 'bad_args');
        const opts = { schemaId };
        if (flags.id !== undefined) opts.id = String(flags.id);
        if (flags.x !== undefined) opts.x = coerce(String(flags.x));
        if (flags.y !== undefined) opts.y = coerce(String(flags.y));
        if (flags.fields !== undefined) {
          try { opts.fieldValues = JSON.parse(flags.fields); }
          catch (e) { die(`--fields is not valid JSON: ${e.message}`, 'bad_args'); }
        }
        let created;
        const r = await b.edit(folder, file, (graph) => {
          created = addNode(graph, opts);
        });
        out({ ok: true, folder, file, version: r.version, node: created });
        break;
      }
      case 'rm-node': {
        const [folder, file, nodeId] = rest;
        if (!nodeId) die('usage: <folder> <file> <nodeId>', 'bad_args');
        let result;
        const r = await b.edit(folder, file, (graph) => {
          result = removeNode(graph, nodeId);
        });
        out({ ok: true, folder, file, version: r.version, nodeId, ...result });
        break;
      }
      case 'link': {
        const [folder, file, fromNode, fromPort, toNode, toPort] = rest;
        if (!toPort) die('usage: <folder> <file> <fromNode> <fromPort> <toNode> <toPort>', 'bad_args');
        let result;
        const r = await b.edit(folder, file, (graph) => {
          result = addLink(graph, { fromNode, fromPort, toNode, toPort });
        });
        out({ ok: true, folder, file, version: r.version, fromNode, fromPort, toNode, toPort, duplicate: !!(result && result.duplicate) });
        break;
      }
      case 'unlink': {
        const [folder, file, fromNode, fromPort, toNode, toPort] = rest;
        if (!toPort) die('usage: <folder> <file> <fromNode> <fromPort> <toNode> <toPort>', 'bad_args');
        let removed;
        const r = await b.edit(folder, file, (graph) => {
          removed = removeLink(graph, { fromNode, fromPort, toNode, toPort });
        });
        out({ ok: true, folder, file, version: r.version, fromNode, fromPort, toNode, toPort, removed });
        break;
      }
      case 'build': {
        const r = await b.build(rest[0] || 'Game');
        out({ ok: true, files: r.count, url: b.buildUrl(), written: r.written.slice(0, 20) });
        break;
      }
      default:
        die(`unknown command: ${cmd}`, 'bad_command');
    }
  } finally {
    b.close();
  }
}

async function uiMain(sub, rest, flags) {
  if (!sub) die('usage: ui <new|validate|layers|add-layer|set|rm-layer|put> ...', 'bad_args');

  // Local, no-network operations.
  if (sub === 'validate' && flags.local) {
    const [localPath] = rest;
    if (!localPath) die('usage: ui validate <local.json> --local', 'bad_args');
    let scene;
    try { scene = JSON.parse(fs.readFileSync(localPath, 'utf8')); }
    catch (e) { die(`could not read ${localPath}: ${e.message}`, 'bad_file'); }
    const problems = validateScene(scene, localPath);
    out({ ok: problems.length === 0, file: localPath, problems });
    if (problems.length) process.exitCode = 1;
    return;
  }

  const cookie = process.env.BOONAN_COOKIE;
  const project = process.env.BOONAN_PROJECT;
  if (!cookie) die('BOONAN_COOKIE is not set', 'no_cookie');
  if (!project) die('BOONAN_PROJECT is not set', 'no_project');

  const b = new Boonan({ cookie, project });
  await b.connect();

  try {
    switch (sub) {
      case 'new': {
        const [file] = rest;
        if (!file) die('usage: ui new <file> [--width N] [--height N]', 'bad_args');
        const width = flags.width !== undefined ? Number(flags.width) : undefined;
        const height = flags.height !== undefined ? Number(flags.height) : undefined;
        const scene = makeScene({ width, height });
        const r = await b.createFile('ui', file, JSON.stringify(scene, null, 2));
        out({ ok: true, file, version: r.version, canvas: scene.canvas });
        break;
      }
      case 'validate': {
        const [file] = rest;
        if (!file) die('usage: ui validate <file>', 'bad_args');
        const f = await b.readFile('ui', file);
        let scene;
        try { scene = JSON.parse(f.content); }
        catch (e) { die(`ui/${file}: not JSON — ${e.message}`, 'bad_json'); }
        const problems = validateScene(scene, `ui/${file}`);
        out({ ok: problems.length === 0, file, version: f.version, problems });
        if (problems.length) process.exitCode = 1;
        break;
      }
      case 'layers': {
        const [file] = rest;
        if (!file) die('usage: ui layers <file>', 'bad_args');
        const f = await b.readFile('ui', file);
        let scene;
        try { scene = JSON.parse(f.content); }
        catch (e) { die(`ui/${file}: not JSON — ${e.message}`, 'bad_json'); }
        const nodes = (scene.nodes || []).map(n => ({
          id: n.id, name: n.name, parent: n.parent, isGroup: n.isGroup,
          text: n.text && n.text.enabled ? n.text.string : undefined,
          texture: n.texture,
        }));
        out({ ok: true, file, version: f.version, total: nodes.length, layers: nodes });
        break;
      }
      case 'add-layer': {
        const [file] = rest;
        if (!file) die('usage: ui add-layer <file> [--parent ID] [--json \'{...}\']', 'bad_args');
        let partial = {};
        if (flags.json !== undefined) {
          try { partial = JSON.parse(flags.json); }
          catch (e) { die(`--json is not valid JSON: ${e.message}`, 'bad_args'); }
        }
        if (flags.parent !== undefined) partial.parent = flags.parent;
        let created;
        const r = await b.editJson('ui', file, (scene) => {
          created = makeLayer(partial);
          (scene.nodes || (scene.nodes = [])).push(created);
        }, { validate: validateScene });
        out({ ok: true, file, version: r.version, layer: created });
        break;
      }
      case 'set': {
        const [file, layerIdOrName, key, value] = rest;
        if (value === undefined) die('usage: ui set <file> <layerIdOrName> <key.path> <value> [--expect V]', 'bad_args');
        const coerced = coerce(value);
        const expect = flags.expect !== undefined ? coerce(String(flags.expect)) : undefined;
        let from, to;
        const r = await b.editJson('ui', file, (scene) => {
          const layer = findLayer(scene, layerIdOrName);
          const was = readAt(layer, key);
          if (expect !== undefined && was !== expect) {
            throw new BoonanError(`${layerIdOrName}.${key}: expected ${JSON.stringify(expect)}, found ${JSON.stringify(was)} in file`, 'expect_mismatch');
          }
          from = was;
          setPath(layer, key, coerced);
          to = coerced;
        }, { validate: validateScene });
        out({ ok: true, file, version: r.version, layer: layerIdOrName, key, from, to });
        break;
      }
      case 'rm-layer': {
        const [file, layerIdOrName] = rest;
        if (!layerIdOrName) die('usage: ui rm-layer <file> <layerIdOrName> [--recursive]', 'bad_args');
        let removedIds = [];
        const r = await b.editJson('ui', file, (scene) => {
          const layer = findLayer(scene, layerIdOrName);
          const nodes = scene.nodes || [];
          const children = nodes.filter(n => n.parent === layer.id);
          if (children.length && !flags.recursive) {
            throw new BoonanError(`${layerIdOrName}: has ${children.length} child layer(s); use --recursive to remove them too`, 'has_children');
          }
          const toRemove = new Set([layer.id]);
          if (flags.recursive) {
            let grew = true;
            while (grew) {
              grew = false;
              for (const n of nodes) {
                if (n.parent != null && toRemove.has(n.parent) && !toRemove.has(n.id)) { toRemove.add(n.id); grew = true; }
              }
            }
          }
          removedIds = [...toRemove];
          scene.nodes = nodes.filter(n => !toRemove.has(n.id));
        }, { validate: validateScene });
        out({ ok: true, file, version: r.version, removed: removedIds });
        break;
      }
      case 'put': {
        const [file, localPath] = rest;
        if (!localPath) die('usage: ui put <file> <local.json>', 'bad_args');
        let scene;
        try { scene = JSON.parse(fs.readFileSync(localPath, 'utf8')); }
        catch (e) { die(`could not read ${localPath}: ${e.message}`, 'bad_file'); }
        const problems = validateScene(scene, localPath);
        if (problems.length) { out({ ok: false, stage: 'validate', problems }); process.exitCode = 1; break; }
        const version = b._versions.get(`ui|${file}`);
        let base = version;
        if (base === undefined) {
          try { const f = await b.readFile('ui', file); base = f.version; } catch (_) {}
        }
        const r = await b.writeFile('ui', file, JSON.stringify(scene, null, 2), { baseVersion: base });
        out({ ok: true, file, version: r.version, layers: (scene.nodes || []).length });
        break;
      }
      default:
        die(`unknown ui command: ${sub}`, 'bad_command');
    }
  } finally {
    b.close();
  }
}

/** "level_1" or "level_1.json" -> {file: "level_1.json", base: "level_1"} */
function normMapFile(name) {
  const file = name.endsWith('.json') ? name : `${name}.json`;
  const base = file.slice(0, -5);
  return { file, base };
}

async function mapMain(sub, rest, flags) {
  if (!sub) die('usage: map <new|info|validate|show|add-tileset|tile|erase|fill|resize|add-layer|rm-layer|objects|object|rm-object|put|get|register> ...', 'bad_args');

  // Local, no-network operations.
  if (sub === 'validate' && flags.local) {
    const [localPath] = rest;
    if (!localPath) die('usage: map validate <local.json> --local', 'bad_args');
    let map;
    try { map = JSON.parse(fs.readFileSync(localPath, 'utf8')); }
    catch (e) { die(`could not read ${localPath}: ${e.message}`, 'bad_file'); }
    const problems = mapLib.validateMap(map, localPath);
    out({ ok: problems.length === 0, file: localPath, problems });
    if (problems.length) process.exitCode = 1;
    return;
  }

  const cookie = process.env.BOONAN_COOKIE;
  const project = process.env.BOONAN_PROJECT;
  if (!cookie) die('BOONAN_COOKIE is not set', 'no_cookie');
  if (!project) die('BOONAN_PROJECT is not set', 'no_project');

  const b = new Boonan({ cookie, project });
  await b.connect();

  try {
    switch (sub) {
      case 'new': {
        const [name] = rest;
        if (!name) die('usage: map new <file> [--cols N] [--rows N] [--tile N] [--register]', 'bad_args');
        const { file, base } = normMapFile(name);
        const opts = {};
        if (flags.cols !== undefined) opts.cols = Number(flags.cols);
        if (flags.rows !== undefined) opts.rows = Number(flags.rows);
        if (flags.tile !== undefined) opts.tileSize = Number(flags.tile);
        const map = mapLib.makeMap(opts);
        const r = await b.createFile('maps', file, JSON.stringify(map, null, 2));
        let registered;
        if (flags.register) registered = await registerMap(b, base);
        out({ ok: true, file, version: r.version, cols: map.cols, rows: map.rows, tileSize: map.tileSize, ...(registered ? { registered } : {}) });
        break;
      }
      case 'info': {
        const [name] = rest;
        if (!name) die('usage: map info <file>', 'bad_args');
        const { file } = normMapFile(name);
        const f = await b.readFile('maps', file);
        let map;
        try { map = JSON.parse(f.content); }
        catch (e) { die(`maps/${file}: not JSON — ${e.message}`, 'bad_json'); }
        const layers = (map.layers || []).map(l => ({ id: l.id, name: l.name, type: l.type || 'tiles', cellsCount: Array.isArray(l.cells) ? l.cells.length : 0 }));
        const tilesets = (map.tilesets || []).map(t => {
          const { gridW, gridH } = mapLib.gridOf(t);
          return { id: t.id, relativePath: t.relativePath, cellSize: t.cellSize, gridW, gridH };
        });
        out({
          ok: true, file, version: f.version,
          cols: map.cols, rows: map.rows, tileSize: map.tileSize,
          pixelWidth: (map.cols || 0) * (map.tileSize || 0), pixelHeight: (map.rows || 0) * (map.tileSize || 0),
          layers, tilesets, objectsCount: (map.objects || []).length,
        });
        break;
      }
      case 'validate': {
        const [name] = rest;
        if (!name) die('usage: map validate <file>', 'bad_args');
        const { file } = normMapFile(name);
        const f = await b.readFile('maps', file);
        let map;
        try { map = JSON.parse(f.content); }
        catch (e) { die(`maps/${file}: not JSON — ${e.message}`, 'bad_json'); }
        const problems = mapLib.validateMap(map, `maps/${file}`);
        out({ ok: problems.length === 0, file, version: f.version, problems });
        if (problems.length) process.exitCode = 1;
        break;
      }
      case 'show': {
        const [name] = rest;
        if (!name) die('usage: map show <file> [--layer L]', 'bad_args');
        const { file } = normMapFile(name);
        const f = await b.readFile('maps', file);
        let map;
        try { map = JSON.parse(f.content); }
        catch (e) { die(`maps/${file}: not JSON — ${e.message}`, 'bad_json'); }
        const { ascii, legend, layer, cols, rows } = mapLib.renderAscii(map, flags.layer);
        out({ ok: true, file, layer, cols, rows, ascii, legend });
        break;
      }
      case 'add-tileset': {
        const [name, image] = rest;
        if (!image) die('usage: map add-tileset <file> <img path e.g. img/Tilesets/grass.png> --cell N [--local ./grass.png] [--w N --h N]', 'bad_args');
        const { file } = normMapFile(name);
        const cellSize = Number(flags.cell);
        if (!(cellSize > 0)) die('--cell N is required', 'bad_args');
        let imageW, imageH;
        if (flags.local) {
          let buf;
          try { buf = fs.readFileSync(flags.local); }
          catch (e) { die(`could not read ${flags.local}: ${e.message}`, 'bad_file'); }
          const size = mapLib.pngSize(buf);
          imageW = size.w; imageH = size.h;
        } else if (flags.w !== undefined && flags.h !== undefined) {
          imageW = Number(flags.w); imageH = Number(flags.h);
        } else {
          die('need --local <png> or --w/--h', 'bad_args');
        }
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.addTileset(map, { image, cellSize, imageW, imageH });
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, id: result.id, existed: result.existed, tileset: result.tileset });
        break;
      }
      case 'tile': {
        const [name, layer, xs, ys, tileset, tile] = rest;
        if (tile === undefined) die('usage: map tile <file> <layer> <x> <y> <tileset> <tile>', 'bad_args');
        const { file } = normMapFile(name);
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.setTile(map, { layer, x: Number(xs), y: Number(ys), tileset, tile });
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, ...result });
        break;
      }
      case 'erase': {
        const [name, layer, xs, ys] = rest;
        if (ys === undefined) die('usage: map erase <file> <layer> <x> <y>', 'bad_args');
        const { file } = normMapFile(name);
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.eraseTile(map, { layer, x: Number(xs), y: Number(ys) });
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, ...result });
        break;
      }
      case 'fill': {
        const [name, layer, x0, y0, x1, y1, tileset, tile] = rest;
        if (tile === undefined) die('usage: map fill <file> <layer> <x0> <y0> <x1> <y1> <tileset> <tile>', 'bad_args');
        const { file } = normMapFile(name);
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.fillRect(map, {
            layer, x0: Number(x0), y0: Number(y0), x1: Number(x1), y1: Number(y1), tileset, tile,
          });
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, ...result });
        break;
      }
      case 'resize': {
        const [name, cols, rows] = rest;
        if (rows === undefined) die('usage: map resize <file> <cols> <rows>', 'bad_args');
        const { file } = normMapFile(name);
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.setSize(map, Number(cols), Number(rows));
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, ...result });
        break;
      }
      case 'add-layer': {
        const [name, layerName] = rest;
        if (!layerName) die('usage: map add-layer <file> <name> [--type tiles|objects|entities]', 'bad_args');
        const { file } = normMapFile(name);
        let created;
        const r = await b.editJson('maps', file, (map) => {
          created = mapLib.addLayer(map, { name: layerName, type: flags.type || 'tiles' });
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, layer: created });
        break;
      }
      case 'rm-layer': {
        const [name, layer] = rest;
        if (!layer) die('usage: map rm-layer <file> <layer>', 'bad_args');
        const { file } = normMapFile(name);
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.rmLayer(map, layer);
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, ...result });
        break;
      }
      case 'objects': {
        const [name] = rest;
        if (!name) die('usage: map objects <file>', 'bad_args');
        const { file } = normMapFile(name);
        const f = await b.readFile('maps', file);
        let map;
        try { map = JSON.parse(f.content); }
        catch (e) { die(`maps/${file}: not JSON — ${e.message}`, 'bad_json'); }
        const objects = (map.objects || []).map(o => ({
          name: o.name, x: o.x, y: o.y, w: o.w, h: o.h, defId: o.defId, sprite: o.sprite, components: o.components,
        }));
        out({ ok: true, file, version: f.version, total: objects.length, objects });
        break;
      }
      case 'object': {
        const [name, objName] = rest;
        if (!objName) die('usage: map object <file> <name> [--x N --y N --w N --h N] [--def ID] [--json \'{...}\']', 'bad_args');
        const { file } = normMapFile(name);
        let partial = { name: objName };
        if (flags.json !== undefined) {
          try { partial = { ...JSON.parse(flags.json), name: objName }; }
          catch (e) { die(`--json is not valid JSON: ${e.message}`, 'bad_args'); }
        }
        for (const k of ['x', 'y', 'w', 'h']) {
          if (flags[k] !== undefined) partial[k] = Number(flags[k]);
        }
        if (flags.def !== undefined) partial.defId = flags.def;
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.upsertObject(map, partial);
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, created: result.created, object: result.object });
        break;
      }
      case 'rm-object': {
        const [name, objName] = rest;
        if (!objName) die('usage: map rm-object <file> <name>', 'bad_args');
        const { file } = normMapFile(name);
        let result;
        const r = await b.editJson('maps', file, (map) => {
          result = mapLib.rmObject(map, objName);
        }, { validate: mapLib.validateMap });
        out({ ok: true, file, version: r.version, ...result });
        break;
      }
      case 'put': {
        const [name, localPath] = rest;
        if (!localPath) die('usage: map put <file> <local.json>', 'bad_args');
        const { file } = normMapFile(name);
        let map;
        try { map = JSON.parse(fs.readFileSync(localPath, 'utf8')); }
        catch (e) { die(`could not read ${localPath}: ${e.message}`, 'bad_file'); }
        const problems = mapLib.validateMap(map, localPath);
        if (problems.length) { out({ ok: false, stage: 'validate', problems }); process.exitCode = 1; break; }
        const version = b._versions.get(`maps|${file}`);
        let base = version;
        if (base === undefined) {
          try { const f = await b.readFile('maps', file); base = f.version; } catch (_) {}
        }
        const r = await b.writeFile('maps', file, JSON.stringify(map, null, 2), { baseVersion: base });
        out({ ok: true, file, version: r.version, layers: (map.layers || []).length, objects: (map.objects || []).length });
        break;
      }
      case 'get': {
        const [name] = rest;
        if (!name) die('usage: map get <file> [--out path]', 'bad_args');
        const { file, base } = normMapFile(name);
        const f = await b.readFile('maps', file);
        const outPath = flags.out || `${base}.json`;
        fs.writeFileSync(outPath, f.content);
        out({ ok: true, file, version: f.version, written: path.resolve(outPath) });
        break;
      }
      case 'register': {
        const [name] = rest;
        if (!name) die('usage: map register <file>', 'bad_args');
        const { base } = normMapFile(name);
        const result = await registerMap(b, base);
        out({ ok: true, ...result });
        break;
      }
      default:
        die(`unknown map command: ${sub}`, 'bad_command');
    }
  } finally {
    b.close();
  }
}

const MAP_REGISTER_SCHEMA = 'Register_Level_maps__action';

/** Ensure a Register_Level_maps__action node exists for `base` (file name without .json). */
async function registerMap(b, base) {
  const files = await b.listFiles();
  const assetFiles = files.filter(f => f.path.startsWith('assets/') && f.path.endsWith('.json')).map(f => f.path.slice('assets/'.length));

  for (const af of assetFiles) {
    const { graph } = await b.readGraph('assets', af);
    const found = (graph.nodes || []).find(n => n.schemaId === MAP_REGISTER_SCHEMA &&
      n.fieldValues && n.fieldValues.name === base);
    if (found) return { registered: false, reason: 'exists', file: af, nodeId: found.id };
  }

  let targetFile = null;
  for (const af of assetFiles) {
    const { graph } = await b.readGraph('assets', af);
    if ((graph.nodes || []).some(n => n.schemaId === MAP_REGISTER_SCHEMA)) { targetFile = af; break; }
  }
  if (!targetFile) targetFile = 'levels.json';

  if (!assetFiles.includes(targetFile)) {
    await b.createFile('assets', targetFile, '{"nodes":[],"links":[]}');
  }

  let createdNode;
  const r = await b.edit('assets', targetFile, (graph) => {
    createdNode = addNode(graph, { schemaId: MAP_REGISTER_SCHEMA, fieldValues: { name: base, ext: 'json' } });
  });
  return { registered: true, file: targetFile, nodeId: createdNode.id, version: r.version };
}

async function uploadMain(rest, flags) {
  const [rawFolder, localPath] = rest;
  if (!localPath) die('usage: upload <folder> <local file> [--as NAME] [--register] [--encoding binary|buffer]', 'bad_args');
  const folder = rawFolder.replace(/^\/+|\/+$/g, '');
  const encoding = flags.encoding || 'binary';
  if (encoding !== 'buffer' && encoding !== 'binary') die('--encoding must be buffer or binary', 'bad_args');
  let buf;
  try { buf = fs.readFileSync(localPath); }
  catch (e) { die(`could not read ${localPath}: ${e.message}`, 'bad_file'); }
  const fileName = typeof flags.as === 'string' ? flags.as : path.basename(localPath);
  const reg = uploadLib.assetRegistration(folder, fileName);

  const problems = uploadLib.checkUpload({ folder, fileName, buf });
  if (problems.length) die('upload failed validation', 'invalid_upload', { problems });
  if (flags['dry-run']) {
    out({ ok: true, dryRun: true, folder, fileName, bytes: buf.length, type: uploadLib.sniffType(buf), encoding, registration: reg });
    return;
  }

  const b = new Boonan({ cookie: process.env.BOONAN_COOKIE, project: process.env.BOONAN_PROJECT });
  await b.connect();
  try {
    const r = await uploadLib.upload(b, { folder, fileName, buf, encoding });
    let registration = null;
    if (flags.register) {
      registration = reg ? await uploadLib.register(b, reg) : { registered: false, reason: 'folder needs no registration' };
    } else if (reg) {
      registration = { registered: false, hint: 'pass --register to add ' + reg.schemaId + ' to assets/' + reg.registryFile };
    }
    out({ ok: true, ...r, registration });
  } finally {
    b.close();
  }
}

main().catch(e => {
  if (e instanceof BoonanError) die(e.message, e.code, e.detail ? { detail: e.detail } : undefined);
  die(String(e && e.message || e), 'unexpected');
});
