'use strict';
/**
 * boonan.io — UI-scene helpers (ui/*.json files: {schema, type:'ui-scene', canvas, nodes}).
 * These are NOT node-graphs ({nodes,links}) — a separate schema and validator live here.
 */
const { BoonanError } = require('./client');

const REQUIRED_FIELDS = ['id', 'name', 'parent', 'isGroup', 'clip', 'texture', 'width', 'height',
  'clampWidth', 'locked', 'rotation', 'stretch', 'slice', 'frame', 'background', 'anchor', 'text', 'hover', 'click'];

const DIRS = ['left-top', 'center-top', 'right-top', 'left-mid', 'center-mid', 'right-mid', 'left-bot', 'center-bot', 'right-bot'];
const DIR_SET = new Set(DIRS);

/** Default plain layer, derived from real ui/*.json samples (most common shape/values). */
function defaultLayer() {
  return {
    id: '',
    name: '',
    parent: null,
    isGroup: false,
    clip: false,
    texture: null,
    width: 100,
    height: 44,
    clampWidth: false,
    locked: false,
    rotation: 0,
    stretch: { horizontal: false, vertical: false },
    slice: { enabled: false, left: 0, right: 0, top: 0, bottom: 0 },
    frame: { x: 0, y: 0, width: 0, height: 0 },
    background: {
      enabled: true,
      fillColor: '#0b0d16a6',
      strokeColor: '#000000',
      strokeThickness: 0,
      corners: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
    },
    anchor: {
      direction: 'left-top',
      left: { value: 0, type: 'pixel' },
      right: { value: 0, type: 'pixel' },
      top: { value: 0, type: 'pixel' },
      bottom: { value: 0, type: 'pixel' },
    },
    text: {
      enabled: false,
      string: '',
      offsetX: 0,
      offsetY: 0,
      fontFamily: 'Roboto, sans-serif',
      fontSize: 16,
      fontWeight: 400,
      fillColor: '#ffffff',
      strokeColor: '#000000',
      strokeThickness: 0,
      alignHorizontal: 'center',
      alignVertical: 'middle',
    },
    hover: { enabled: false, event: '', texture: null, fillColor: '', strokeColor: '', textColor: '', scale: 1 },
    click: { enabled: false, event: '', texture: null, fillColor: '', strokeColor: '', textColor: '', scale: 1 },
  };
}

/** Validate a UI scene: catches what the server would complain about. Returns an array of English problem strings. */
function validateScene(scene, where) {
  const problems = [];
  if (!scene || typeof scene !== 'object') return [`${where}: not an object`];
  if (scene.schema !== 1) problems.push(`${where}: schema must be 1, got ${JSON.stringify(scene.schema)}`);
  if (scene.type !== 'ui-scene') problems.push(`${where}: type must be "ui-scene"`);
  if (!scene.canvas || typeof scene.canvas.width !== 'number' || typeof scene.canvas.height !== 'number') {
    problems.push(`${where}: canvas {width,height} is required`);
  }
  if (!Array.isArray(scene.nodes)) { problems.push(`${where}: nodes must be an array`); return problems; }

  const ids = new Set();

  scene.nodes.forEach((n, i) => {
    const tag = `${where}: nodes[${i}]${n && n.id ? ` (${n.id})` : ''}`;
    if (!n || typeof n !== 'object') { problems.push(`${tag}: not an object`); return; }
    for (const k of REQUIRED_FIELDS) if (!(k in n)) problems.push(`${tag}: missing field ${k}`);
    if (typeof n.id !== 'string' || !n.id) problems.push(`${tag}: id must be a non-empty string`);
    else { if (ids.has(n.id)) problems.push(`${tag}: duplicate id`); ids.add(n.id); }
    if (n.anchor && !DIR_SET.has(n.anchor.direction)) {
      problems.push(`${tag}: anchor.direction=${JSON.stringify(n.anchor.direction)} — allowed: ${DIRS.join(', ')}`);
    }
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const a = n.anchor && n.anchor[side];
      if (a && a.type !== 'pixel' && a.type !== 'percent') problems.push(`${tag}: anchor.${side}.type must be pixel|percent`);
    }
    const hex = (v) => typeof v === 'string' && (v === '' || /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v));
    if (n.background && !hex(n.background.fillColor)) problems.push(`${tag}: background.fillColor is not hex: ${JSON.stringify(n.background.fillColor)}`);
    if (n.background && !hex(n.background.strokeColor)) problems.push(`${tag}: background.strokeColor is not hex`);
    if (n.text && !hex(n.text.fillColor)) problems.push(`${tag}: text.fillColor is not hex`);
  });
  // parent must reference an existing layer (or be null)
  scene.nodes.forEach((n, i) => {
    if (n && n.parent != null && !ids.has(n.parent)) problems.push(`${where}: nodes[${i}] (${n.id}): parent → does not exist ${n.parent}`);
  });
  return problems;
}

/** Empty valid scene. */
function makeScene({ width = 1280, height = 720 } = {}) {
  return { schema: 1, type: 'ui-scene', canvas: { width, height }, nodes: [] };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-merge `src` over `dst`, returning a new object. Arrays and non-objects are replaced wholesale. */
function deepMerge(dst, src) {
  if (!isPlainObject(dst) || !isPlainObject(src)) return src === undefined ? dst : src;
  const out = { ...dst };
  for (const k of Object.keys(src)) {
    out[k] = isPlainObject(dst[k]) && isPlainObject(src[k]) ? deepMerge(dst[k], src[k]) : src[k];
  }
  return out;
}

let _layerSeq = 0;

/** Build a full layer object by deep-merging `partial` over the derived default layer. */
function makeLayer(partial = {}) {
  const layer = deepMerge(defaultLayer(), partial || {});
  if (!layer.id) layer.id = `ui_${Date.now().toString(36)}_${_layerSeq++}`;
  if (!layer.name) layer.name = layer.id;
  return layer;
}

/** Find a layer by id first, then by name (case-sensitive, exact). Throws BoonanError on failure. */
function findLayer(scene, idOrName) {
  const nodes = (scene && scene.nodes) || [];
  const byId = nodes.find(n => n.id === idOrName);
  if (byId) return byId;
  const byName = nodes.filter(n => n.name === idOrName);
  if (byName.length === 0) throw new BoonanError(`layer not found: ${idOrName}`, 'not_found');
  if (byName.length > 1) throw new BoonanError(`ambiguous layer name: ${idOrName} (${byName.length} matches)`, 'ambiguous');
  return byName[0];
}

/** Set a value at a dotted path on an object, creating intermediate objects as needed. */
function setPath(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  const was = cur[leaf];
  cur[leaf] = value;
  return was;
}

module.exports = { validateScene, makeScene, makeLayer, findLayer, setPath, defaultLayer, REQUIRED_FIELDS, DIRS };
