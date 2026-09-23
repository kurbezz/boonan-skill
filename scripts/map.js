'use strict';
/**
 * boonan.io — MAP helpers (maps/<name>.json files).
 * Root shape: {version, cols, rows, tileSize, layers[], objects[], tilesets[]}.
 * Layer:      {id, name, type: tiles|objects|entities, visible, cells}
 * Cell:       cells is an ARRAY of [key, value] pairs, key = "x,y" (cell coords),
 *             value = {tilesetId, tileId}, tileId = "<tilesetId>_t_<index>",
 *             index = row * gridW + col within the tileset image (0-based).
 * Tileset:    {id, relativePath, cellSize, imageW, imageH, ...}. gridW/gridH are
 *             derived: floor(imageW/cellSize) x floor(imageH/cellSize).
 * Object:     open JSON, looked up by `name` at runtime — treat unknown fields as
 *             opaque and never drop them.
 */
const { BoonanError } = require('./client');

const LAYER_TYPES = ['tiles', 'objects', 'entities'];

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function slug(s) {
  const base = String(s || '').replace(/\.[a-zA-Z0-9]+$/, '');
  const cleaned = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'tileset';
}

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/** Deep-merge `src` over `dst`, returning a new object. Arrays and non-objects are replaced wholesale. */
function deepMerge(dst, src) {
  if (!isPlainObject(dst) || !isPlainObject(src)) return src === undefined ? dst : src;
  const out = { ...dst };
  for (const k of Object.keys(src)) {
    out[k] = isPlainObject(dst[k]) && isPlainObject(src[k]) ? deepMerge(dst[k], src[k]) : src[k];
  }
  return out;
}

function gridOf(tileset) {
  const cellSize = tileset && tileset.cellSize;
  const gridW = cellSize ? Math.floor((tileset.imageW || 0) / cellSize) : 0;
  const gridH = cellSize ? Math.floor((tileset.imageH || 0) / cellSize) : 0;
  return { gridW, gridH };
}

/** Validate a map: catches what the engine would choke on. Returns an array of English problem strings. */
function validateMap(map, where) {
  const problems = [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [`${where}: map root is not an object`];

  for (const k of ['cols', 'rows', 'tileSize']) {
    if (typeof map[k] !== 'number' || !(map[k] > 0)) {
      problems.push(`${where}: ${k} must be a positive number, got ${JSON.stringify(map[k])}`);
    }
  }
  for (const k of ['layers', 'objects', 'tilesets']) {
    if (map[k] !== undefined && !Array.isArray(map[k])) problems.push(`${where}: ${k} must be an array`);
  }

  const layers = Array.isArray(map.layers) ? map.layers : [];
  const objects = Array.isArray(map.objects) ? map.objects : [];
  const tilesets = Array.isArray(map.tilesets) ? map.tilesets : [];

  const tsIds = new Set();
  tilesets.forEach((t, i) => {
    if (!t || typeof t.id !== 'string' || !t.id) { problems.push(`${where}: tilesets[${i}]: id must be a non-empty string`); return; }
    if (tsIds.has(t.id)) problems.push(`${where}: tilesets[${i}]: duplicate tileset id ${t.id}`);
    tsIds.add(t.id);
  });
  const tsById = Object.fromEntries(tilesets.filter(t => t && t.id).map(t => [t.id, t]));

  const layerIds = new Set();
  layers.forEach((L, i) => {
    const tag = `${where}: layers[${i}]${L && L.id ? ` (${L.id})` : ''}`;
    if (!L || typeof L !== 'object') { problems.push(`${tag}: not an object`); return; }
    if (typeof L.id !== 'string' || !L.id) problems.push(`${tag}: id must be a non-empty string`);
    else { if (layerIds.has(L.id)) problems.push(`${tag}: duplicate layer id`); layerIds.add(L.id); }
    const type = L.type === undefined ? 'tiles' : L.type;
    if (!LAYER_TYPES.includes(type)) problems.push(`${tag}: type must be one of ${LAYER_TYPES.join('|')}, got ${JSON.stringify(L.type)}`);

    let cells = [];
    if (L.cells === undefined) cells = [];
    else if (!Array.isArray(L.cells)) { problems.push(`${tag}: cells must be an array`); cells = []; }
    else cells = L.cells;

    cells.forEach((pair, ci) => {
      if (!Array.isArray(pair) || pair.length !== 2) { problems.push(`${tag}: cells[${ci}]: must be a [key, value] pair`); return; }
      const [key, value] = pair;
      if (typeof key !== 'string' || !/^-?\d+,-?\d+$/.test(key)) {
        problems.push(`${tag}: cells[${ci}]: key ${JSON.stringify(key)} must be "x,y" with integers`);
        return;
      }
      const [xs, ys] = key.split(',');
      const x = parseInt(xs, 10), y = parseInt(ys, 10);
      if (typeof map.cols === 'number' && (x < 0 || x >= map.cols)) problems.push(`${tag}: cells[${ci}]: x=${x} out of range 0..${map.cols - 1}`);
      if (typeof map.rows === 'number' && (y < 0 || y >= map.rows)) problems.push(`${tag}: cells[${ci}]: y=${y} out of range 0..${map.rows - 1}`);
      if (!value || typeof value !== 'object' || typeof value.tilesetId !== 'string' || typeof value.tileId !== 'string') {
        problems.push(`${tag}: cells[${ci}]: value must be {tilesetId, tileId} strings`);
        return;
      }
      const ts = tsById[value.tilesetId];
      if (!ts) { problems.push(`${tag}: cells[${ci}]: tileset not found: ${value.tilesetId}`); return; }
      const re = new RegExp(`^${escapeRegex(value.tilesetId)}_t_(\\d+)$`);
      const m = value.tileId.match(re);
      if (!m) { problems.push(`${tag}: cells[${ci}]: tileId ${JSON.stringify(value.tileId)} does not match ${value.tilesetId}_t_<n>`); return; }
      const index = parseInt(m[1], 10);
      const { gridW, gridH } = gridOf(ts);
      if (index < 0 || index >= gridW * gridH) {
        problems.push(`${tag}: cells[${ci}]: tile index ${index} out of range for ${ts.id} (${gridW}x${gridH}, index 0..${gridW * gridH - 1})`);
      }
    });
  });

  const names = new Map();
  objects.forEach((o, i) => {
    const tag = `${where}: objects[${i}]`;
    if (!o || typeof o !== 'object') { problems.push(`${tag}: not an object`); return; }
    if (typeof o.name !== 'string' || !o.name) problems.push(`${tag}: name must be a non-empty string`);
    else names.set(o.name, (names.get(o.name) || 0) + 1);
    if (o.sprite && typeof o.sprite === 'object' && o.sprite.tilesetId && !tsById[o.sprite.tilesetId]) {
      problems.push(`${tag} (${o.name}): sprite.tilesetId not found: ${o.sprite.tilesetId}`);
    }
  });
  for (const [name, count] of names) {
    if (count > 1) problems.push(`${where}: object name ${JSON.stringify(name)} is used ${count} times — the engine looks objects up by name`);
  }

  return problems;
}

/** Empty valid map. */
function makeMap({ cols = 40, rows = 30, tileSize = 32 } = {}) {
  return {
    version: 1,
    cols, rows, tileSize,
    layers: [
      { id: 'layer_ground', name: 'ground', type: 'tiles', visible: true, cells: [] },
      { id: 'layer_entities', name: 'entities', type: 'entities', visible: true, cells: [] },
    ],
    objects: [],
    tilesets: [],
  };
}

/** Find a layer by id first, then by name (case-sensitive, exact). Throws BoonanError on failure. */
function findLayer(map, idOrName) {
  const layers = (map && map.layers) || [];
  const byId = layers.find(l => l.id === idOrName);
  if (byId) return byId;
  const byName = layers.filter(l => l.name === idOrName);
  if (byName.length === 0) throw new BoonanError(`layer not found: ${idOrName}`, 'not_found');
  if (byName.length > 1) throw new BoonanError(`ambiguous layer name: ${idOrName} (${byName.length} matches)`, 'ambiguous');
  return byName[0];
}

/** Find a tileset by id, then by relativePath. Throws BoonanError on failure. */
function findTileset(map, idOrPath) {
  const tilesets = (map && map.tilesets) || [];
  const byId = tilesets.find(t => t.id === idOrPath);
  if (byId) return byId;
  const byPath = tilesets.find(t => t.relativePath === idOrPath);
  if (byPath) return byPath;
  const known = tilesets.map(t => t.id).join(', ') || '(none)';
  throw new BoonanError(`tileset not found: ${idOrPath} — known: ${known}`, 'not_found');
}

/** Accept a plain index ("7") or a full tileId ("ts_grass_t_7") for the given tileset. */
function normalizeTile(tileset, tile) {
  const raw = String(tile);
  let index;
  if (/^\d+$/.test(raw)) {
    index = parseInt(raw, 10);
  } else {
    const re = new RegExp(`^${escapeRegex(tileset.id)}_t_(\\d+)$`);
    const m = raw.match(re);
    if (!m) throw new BoonanError(`invalid tile ${JSON.stringify(tile)} for tileset ${tileset.id} (expected a number or ${tileset.id}_t_<n>)`, 'bad_args');
    index = parseInt(m[1], 10);
  }
  const { gridW, gridH } = gridOf(tileset);
  if (index < 0 || index >= gridW * gridH) {
    throw new BoonanError(`tile index ${index} out of range for ${tileset.id} (${gridW}x${gridH}, index 0..${gridW * gridH - 1})`, 'bad_args');
  }
  return { index, tileId: `${tileset.id}_t_${index}` };
}

/** Add a tileset. Returns the existing tileset (existed:true) if relativePath is already present. */
function addTileset(map, opts = {}) {
  const { image, cellSize, imageW, imageH } = opts;
  if (!image) throw new BoonanError('image path is required', 'bad_args');
  if (!(cellSize > 0)) throw new BoonanError('cellSize must be a positive number', 'bad_args');
  if (!(imageW > 0) || !(imageH > 0)) throw new BoonanError('imageW/imageH must be positive numbers', 'bad_args');

  const tilesets = map.tilesets || (map.tilesets = []);
  const existing = tilesets.find(t => t.relativePath === image);
  if (existing) return { id: existing.id, existed: true, tileset: existing };

  let id = opts.id;
  if (id) {
    if (tilesets.some(t => t.id === id)) throw new BoonanError(`tileset id already exists: ${id}`, 'duplicate_id');
  } else {
    const base = slug(image.split('/').pop());
    id = `ts_${base}`;
    let i = 2;
    while (tilesets.some(t => t.id === id)) id = `ts_${base}_${i++}`;
  }
  const tileset = { id, relativePath: image, cellSize, imageW, imageH };
  tilesets.push(tileset);
  return { id, existed: false, tileset };
}

/** Set a single cell. Returns {layer, key, tilesetId, tileId, changed}. */
function setTile(map, { layer, x, y, tileset, tile }) {
  const L = findLayer(map, layer);
  const ts = findTileset(map, tileset);
  const { tileId } = normalizeTile(ts, tile);
  const key = `${x},${y}`;
  const cells = Array.isArray(L.cells) ? L.cells : (L.cells = []);
  const value = { tilesetId: ts.id, tileId };
  const idx = cells.findIndex(p => Array.isArray(p) && p[0] === key);
  let changed;
  if (idx === -1) { cells.push([key, value]); changed = true; }
  else {
    const cur = cells[idx][1] || {};
    const same = cur.tilesetId === value.tilesetId && cur.tileId === value.tileId;
    if (same) changed = false;
    else { cells[idx] = [key, value]; changed = true; }
  }
  return { layer: L.id, key, tilesetId: ts.id, tileId, changed };
}

/** Erase a single cell. Returns {layer, key, removed}. */
function eraseTile(map, { layer, x, y }) {
  const L = findLayer(map, layer);
  const key = `${x},${y}`;
  const cells = Array.isArray(L.cells) ? L.cells : (L.cells = []);
  const idx = cells.findIndex(p => Array.isArray(p) && p[0] === key);
  if (idx === -1) return { layer: L.id, key, removed: false };
  cells.splice(idx, 1);
  return { layer: L.id, key, removed: true };
}

/** Fill an inclusive rectangle, clipped to map bounds. Returns {layer, tilesetId, tileId, count}. */
function fillRect(map, { layer, x0, y0, x1, y1, tileset, tile }) {
  const L = findLayer(map, layer);
  const ts = findTileset(map, tileset);
  const { tileId } = normalizeTile(ts, tile);
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min((map.cols || 1) - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min((map.rows || 1) - 1, Math.max(y0, y1));
  const cells = Array.isArray(L.cells) ? L.cells : (L.cells = []);
  const value = { tilesetId: ts.id, tileId };
  let count = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const key = `${x},${y}`;
      const idx = cells.findIndex(p => Array.isArray(p) && p[0] === key);
      if (idx === -1) { cells.push([key, { ...value }]); count++; }
      else {
        const cur = cells[idx][1] || {};
        if (cur.tilesetId !== value.tilesetId || cur.tileId !== value.tileId) { cells[idx] = [key, { ...value }]; count++; }
      }
    }
  }
  return { layer: L.id, tilesetId: ts.id, tileId, count };
}

/** Resize the map, dropping cells that fall outside the new bounds. Returns {cols, rows, dropped}. */
function setSize(map, cols, rows) {
  map.cols = cols;
  map.rows = rows;
  let dropped = 0;
  for (const L of map.layers || []) {
    if (!Array.isArray(L.cells)) continue;
    L.cells = L.cells.filter((p) => {
      if (!Array.isArray(p)) return true;
      const [xs, ys] = String(p[0]).split(',');
      const x = parseInt(xs, 10), y = parseInt(ys, 10);
      const keep = x >= 0 && x < cols && y >= 0 && y < rows;
      if (!keep) dropped++;
      return keep;
    });
  }
  return { cols, rows, dropped };
}

/** Add a layer. Returns the created layer. */
function addLayer(map, { name, type = 'tiles' } = {}) {
  if (!name) throw new BoonanError('layer name is required', 'bad_args');
  if (!LAYER_TYPES.includes(type)) throw new BoonanError(`layer type must be one of ${LAYER_TYPES.join('|')}, got ${JSON.stringify(type)}`, 'bad_args');
  const layers = map.layers || (map.layers = []);
  const base = `layer_${slug(name)}`;
  let id = base;
  let i = 2;
  while (layers.some(l => l.id === id)) id = `${base}_${i++}`;
  const layer = { id, name, type, visible: true, cells: [] };
  layers.push(layer);
  return layer;
}

/** Remove a layer by id or name. Returns {removed, id}. */
function rmLayer(map, idOrName) {
  const layers = map.layers || (map.layers = []);
  const L = findLayer(map, idOrName);
  map.layers = layers.filter(l => l.id !== L.id);
  return { removed: true, id: L.id };
}

/** Upsert an object by `name`: deep-merge into an existing one, or append a new one. */
function upsertObject(map, partial) {
  if (!partial || typeof partial.name !== 'string' || !partial.name) {
    throw new BoonanError('object name is required', 'bad_args');
  }
  const objects = map.objects || (map.objects = []);
  const idx = objects.findIndex(o => o && o.name === partial.name);
  if (idx === -1) {
    const obj = JSON.parse(JSON.stringify(partial));
    if (objects.some(o => o && o.id)) obj.id = obj.id || `obj_${Date.now().toString(36)}_${objects.length}`;
    objects.push(obj);
    return { object: obj, created: true };
  }
  const merged = deepMerge(objects[idx], partial);
  objects[idx] = merged;
  return { object: merged, created: false };
}

/** Remove an object by name. Returns {removed}. */
function rmObject(map, name) {
  const objects = map.objects || (map.objects = []);
  const before = objects.length;
  map.objects = objects.filter(o => !o || o.name !== name);
  return { removed: map.objects.length !== before };
}

/** Read {w, h} from a PNG buffer's IHDR chunk. */
function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!Buffer.isBuffer(buf) || buf.length < 24) throw new BoonanError('not a PNG file (too short)', 'bad_png');
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new BoonanError('not a PNG file (bad signature)', 'bad_png');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

const ASCII_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Render a layer's cells as an ASCII grid, capped at 120x60. Returns {ascii, legend, layer, cols, rows}. */
function renderAscii(map, layerIdOrName) {
  const L = layerIdOrName ? findLayer(map, layerIdOrName) : (map.layers || [])[0];
  if (!L) throw new BoonanError('map has no layers', 'not_found');
  const cols = Math.min(map.cols || 0, 120);
  const rows = Math.min(map.rows || 0, 60);
  const cells = Array.isArray(L.cells) ? L.cells : [];

  const tileIds = [...new Set(cells.map(p => p[1] && p[1].tileId).filter(Boolean))].sort();
  const legend = {};
  const letterOf = {};
  tileIds.forEach((tid, i) => {
    const letter = i < ASCII_LETTERS.length ? ASCII_LETTERS[i] : `#${i}`;
    legend[letter] = tid;
    letterOf[tid] = letter;
  });

  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
  for (const pair of cells) {
    if (!Array.isArray(pair)) continue;
    const [key, value] = pair;
    const [xs, ys] = String(key).split(',');
    const x = parseInt(xs, 10), y = parseInt(ys, 10);
    if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
    grid[y][x] = (value && letterOf[value.tileId]) || '?';
  }
  const ascii = grid.map(row => row.join('')).join('\n');
  return { ascii, legend, layer: L.id, cols, rows };
}

module.exports = {
  validateMap, makeMap, findLayer, findTileset, normalizeTile,
  addTileset, setTile, eraseTile, fillRect, setSize,
  addLayer, rmLayer, upsertObject, rmObject,
  pngSize, renderAscii, deepMerge, gridOf, slug,
  LAYER_TYPES,
};
