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
 */
const fs = require('fs');
const { Boonan, BoonanError, addNode, addLink, removeLink, removeNode } = require('./client');

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

  const cookie = process.env.BOONAN_COOKIE;
  const project = process.env.BOONAN_PROJECT;
  if (!cookie) die('BOONAN_COOKIE is not set', 'no_cookie');
  if (!project) die('BOONAN_PROJECT is not set', 'no_project');

  if (cmd === 'url') {
    out({ ok: true, url: `https://boonan.io/projects/${project}/build/index.html` });
    return;
  }

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

main().catch(e => {
  if (e instanceof BoonanError) die(e.message, e.code, e.detail ? { detail: e.detail } : undefined);
  die(String(e && e.message || e), 'unexpected');
});
