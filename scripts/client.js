'use strict';
/**
 * boonan.io — headless client on top of the editor's socket.io protocol.
 * Protocol captured via live interception, see docs/user_api.md.
 *
 * No browser needed. Only a session cookie is required.
 */
const { io } = require('socket.io-client');

const DEFAULT_ORIGIN = 'https://boonan.io';

class BoonanError extends Error {
  constructor(message, code, detail) {
    super(message);
    this.name = 'BoonanError';
    this.code = code || 'error';
    if (detail !== undefined) this.detail = detail;
  }
}

/** Server responses arrive as objects like {error: "..."}; extract the text. */
function errText(e) {
  if (!e) return 'unknown';
  if (typeof e === 'string') return e;
  return e.error || e.message || e.reason || JSON.stringify(e).slice(0, 300);
}

class Boonan {
  /**
   * @param {object} opts
   * @param {string} opts.cookie  - "connect.sid=...; gid=..."
   * @param {string} opts.project - project uuid
   * @param {string} [opts.origin]
   * @param {number} [opts.timeout] - response timeout, ms (server limit ~30s)
   * @param {number} [opts.minGapMs] - minimum pause between writes
   */
  constructor(opts = {}) {
    if (!opts.cookie) throw new BoonanError('a session cookie is required', 'no_cookie');
    if (!opts.project) throw new BoonanError('a project id is required', 'no_project');
    this.cookie = opts.cookie;
    this.project = opts.project;
    this.origin = opts.origin || DEFAULT_ORIGIN;
    this.timeout = opts.timeout || 30000;
    this.minGapMs = opts.minGapMs === undefined ? 250 : opts.minGapMs;
    this.socket = null;
    this._versions = new Map();
    this._lastWrite = 0;
    this._log = [];
  }

  get versions() { return Object.fromEntries(this._versions); }
  get traffic() { return this._log.slice(); }

  async connect() {
    if (this.socket && this.socket.connected) return this;
    this.socket = io(this.origin, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        Cookie: this.cookie,
        // the server checks Origin: without it connect_error is "origin not allowed"
        Origin: this.origin,
        Referer: `${this.origin}/project/${this.project}/node-editor`,
      },
    });

    this.socket.onAny((ev, a) => {
      this._log.push({ dir: 'in', ev, t: Date.now() });
      if (this._log.length > 500) this._log.shift();
    });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new BoonanError('connection timeout', 'connect_timeout')), 20000);
      this.socket.once('connect', () => { clearTimeout(t); resolve(); });
      this.socket.once('connect_error', (e) => {
        clearTimeout(t);
        const msg = String(e && e.message || e);
        reject(new BoonanError(
          msg === 'origin not allowed'
            ? 'origin not allowed - check the Origin header'
            : (/auth|forbidden|unauthor/i.test(msg) ? 'session is invalid - a fresh cookie is required' : msg),
          'connect_error'));
      });
    });

    this.socket.on('disconnect', (reason) => {
      this._log.push({ dir: 'disconnect', reason, t: Date.now() });
      if (reason === 'io server disconnect') {
        this._serverClosed = 'server closed the connection (io server disconnect)';
      }
    });
    return this;
  }

  close() { if (this.socket) { this.socket.close(); this.socket = null; } }

  _assertLive() {
    if (this._serverClosed) throw new BoonanError(this._serverClosed, 'disconnected');
    if (!this.socket || !this.socket.connected) throw new BoonanError('not connected', 'disconnected');
  }

  /** Send an event and wait for one of two responses. */
  _rpc(outEv, payload, okEv, errEv, timeout) {
    this._assertLive();
    return new Promise((resolve, reject) => {
      const ms = timeout || this.timeout;
      const t = setTimeout(() => {
        cleanup();
        reject(new BoonanError(`timeout for ${outEv} (${ms} ms)`, 'timeout'));
      }, ms);
      const onOk = (d) => { cleanup(); resolve(d); };
      const onErr = (e) => { cleanup(); reject(new BoonanError(errText(e), 'server_error', e)); };
      const cleanup = () => {
        clearTimeout(t);
        this.socket.off(okEv, onOk);
        if (errEv) this.socket.off(errEv, onErr);
      };
      this.socket.on(okEv, onOk);
      if (errEv) this.socket.on(errEv, onErr);
      this._log.push({ dir: 'out', ev: outEv, t: Date.now() });
      if (payload === undefined) this.socket.emit(outEv);
      else this.socket.emit(outEv, payload);
    });
  }

  /** Flat list of project files. */
  async listFiles() {
    const tree = await this._rpc('read-folder-project', undefined,
      'folder-contents-project', null);
    const out = [];
    (function walk(nodes, prefix) {
      for (const n of nodes || []) {
        const p = prefix ? `${prefix}/${n.name}` : n.name;
        if (n.isDirectory) walk(n.contents, p);
        else out.push({ path: p, size: n.size, protected: !!n.protected });
      }
    })(tree, '');
    return out;
  }

  /** Read a file. Returns {content, version}. */
  async readFile(folder, name) {
    const d = await this._rpc('read-file-project', { folderName: folder, fileName: name },
      'file-contents-project', 'file-read-error');
    this._versions.set(`${folder}|${name}`, d.version);
    return { content: d.content, version: d.version, folder, name };
  }

  /** Read and parse a graph. */
  async readGraph(folder, name) {
    const f = await this.readFile(folder, name);
    let graph;
    try { graph = JSON.parse(f.content); }
    catch (e) { throw new BoonanError(`${folder}/${name}: not JSON — ${e.message}`, 'bad_json'); }
    return { graph, version: f.version, folder, name };
  }

  async _pace() {
    const gap = Date.now() - this._lastWrite;
    if (gap < this.minGapMs) await new Promise(r => setTimeout(r, this.minGapMs - gap));
  }

  /** Write a file with optimistic locking. */
  async writeFile(folder, name, content, opts = {}) {
    await this._pace();
    const payload = { folderName: folder, fileName: name, content };
    const base = opts.baseVersion !== undefined ? opts.baseVersion : this._versions.get(`${folder}|${name}`);
    if (base) payload.baseVersion = base;
    const d = await this._rpc('save-file-project', payload, 'file-saved-project', 'file-save-error');
    this._lastWrite = Date.now();
    this._versions.set(`${folder}|${name}`, d.version);
    return { folder, name, version: d.version, bytes: content.length };
  }

  /** Write a graph (with schema validation). */
  async writeGraph(folder, name, graph, opts = {}) {
    if (!opts.skipValidation) {
      const problems = validateGraph(graph, `${folder}/${name}`);
      if (problems.length) throw new BoonanError('graph failed validation:\n  ' + problems.join('\n  '), 'invalid_graph', problems);
    }
    return this.writeFile(folder, name, JSON.stringify(graph, null, 2), opts);
  }

  /**
   * Read → mutate → write in one cycle.
   * mutate(graph) mutates the object in place or returns a new one.
   * On a version conflict, re-reads and retries.
   */
  async edit(folder, name, mutate, opts = {}) {
    const retries = opts.retries === undefined ? 3 : opts.retries;
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const { graph, version } = await this.readGraph(folder, name);
      const next = mutate(graph) || graph;
      try {
        const r = await this.writeGraph(folder, name, next, { ...opts, baseVersion: version });
        return { ...r, attempts: attempt + 1 };
      } catch (e) {
        last = e;
        const conflict = /изменил|baseVersion|версия|слить|modified|changed|version|conflict|merge/i.test(e.message);
        if (!conflict || attempt === retries) throw e;
        await new Promise(r => setTimeout(r, 250 + attempt * 400));
      }
    }
    throw last;
  }

  /** Point-update node fields: [{nodeId, key, value}]. key looks like 'fieldValues.width' or 'x'. */
  async setNodeFields(folder, name, edits, opts = {}) {
    const applied = [], missing = [], unchanged = [];
    const r = await this.edit(folder, name, (graph) => {
      for (const { nodeId, key, value, expect } of edits) {
        const node = (graph.nodes || []).find(n => n.id === nodeId);
        if (!node) { missing.push(nodeId); continue; }
        const path = String(key).split('.');
        let obj = node;
        for (let i = 0; i < path.length - 1; i++) {
          if (obj[path[i]] == null) obj[path[i]] = {};
          obj = obj[path[i]];
        }
        const leaf = path[path.length - 1];
        const was = obj[leaf];
        if (expect !== undefined && was !== expect) {
          throw new BoonanError(`${nodeId}.${key}: expected ${JSON.stringify(expect)}, found ${JSON.stringify(was)} in file`, 'expect_mismatch');
        }
        if (was === value) { unchanged.push({ nodeId, key, value }); continue; }
        obj[leaf] = value;
        applied.push({ nodeId, key, from: was, to: value });
      }
    }, opts);
    return { ...r, applied, missing, unchanged };
  }

  /** Build the project. Returns the list of written files. */
  async build(title = 'Game') {
    const d = await this._rpc('build-project', { title },
      'project-built', 'project-build-error', 60000);
    return { ok: true, written: d.written || [], count: (d.written || []).length };
  }

  async deleteFile(folder, name) {
    this._assertLive();
    this.socket.emit('delete-file-project', { folderName: folder, fileName: name });
    await new Promise(r => setTimeout(r, 400));
    return { folder, name, deleted: true };
  }

  /** URL of the built game. */
  buildUrl() { return `${this.origin}/projects/${this.project}/build/index.html`; }
}

/** Validate a graph before sending: catches what the server would complain about. */
function validateGraph(graph, where = 'graph') {
  const problems = [];
  if (!graph || typeof graph !== 'object') return [`${where}: not an object`];

  const extra = Object.keys(graph).filter(k => k !== 'nodes' && k !== 'links');
  if (extra.length) problems.push(`${where}: unexpected root fields: ${extra.join(', ')}`);
  if (!Array.isArray(graph.nodes)) problems.push(`${where}: nodes must be an array`);
  if (!Array.isArray(graph.links)) problems.push(`${where}: links must be an array`);
  if (problems.length) return problems;

  const ids = new Set();
  graph.nodes.forEach((n, i) => {
    if (!n || typeof n.id !== 'string') { problems.push(`${where}: nodes[${i}]: missing id`); return; }
    if (ids.has(n.id)) problems.push(`${where}: nodes[${i}]: duplicate id ${n.id}`);
    ids.add(n.id);
    if (typeof n.schemaId !== 'string' || !/^[A-Za-z0-9_]+$/.test(n.schemaId)) {
      problems.push(`${where}: nodes[${i}] (${n.id}): schemaId must match [A-Za-z0-9_], got ${JSON.stringify(n.schemaId)}`);
    }
  });
  graph.links.forEach((l, i) => {
    for (const side of ['fromNode', 'toNode']) {
      const v = l && l[side];
      if (typeof v !== 'string') problems.push(`${where}: links[${i}].${side} must be an id string`);
      else if (!ids.has(v)) problems.push(`${where}: links[${i}].${side} → node does not exist ${v}`);
    }
  });
  return problems;
}

module.exports = { Boonan, BoonanError, validateGraph };
