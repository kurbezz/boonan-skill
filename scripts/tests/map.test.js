'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateMap,
  addTileset,
  setTile,
  upsertObject,
  rmObject,
} = require('../map');

function realMap() {
  return {
    version: 1, cols: 60, rows: 20, tileSize: 32,
    layers: [
      { id: 'layer_1', name: 'Objects', type: 'objects', visible: true, cells: [] },
      { id: 'layer_2', name: 'Layer 2', type: 'tiles', visible: true,
        cells: [['0,0', { tilesetId: null, tileId: '0' }]] },
    ],
  };
}

test('validates the observed map shape with omitted arrays and empty placeholder cells', () => {
  assert.deepEqual(validateMap(realMap(), 'maps/level_1.json'), []);
});

test('rejects null-tileset cells except for the confirmed empty placeholder', () => {
  const map = realMap();
  map.layers[1].cells[0][1].tileId = '1';
  assert.match(validateMap(map, 'maps/level_1.json').join('\n'), /empty placeholder/);
});

test('painting a normal tile preserves empty cells and validates its tile index', () => {
  const map = realMap();
  const { id } = addTileset(map, {
    image: 'img/Tilesets/grass.png', cellSize: 32, imageW: 256, imageH: 256,
  });
  const result = setTile(map, { layer: 'Layer 2', x: 1, y: 0, tileset: id, tile: '7' });
  assert.equal(result.tileId, 'ts_grass_t_7');
  assert.deepEqual(map.layers[1].cells[0][1], { tilesetId: null, tileId: '0' });
  assert.deepEqual(validateMap(map, 'maps/level_1.json'), []);

  map.layers[1].cells[1][1].tileId = 'ts_grass_t_70';
  assert.match(validateMap(map, 'maps/level_1.json').join('\n'), /tile index 70 out of range/);
});

test('object upsert and removal preserve unknown fields', () => {
  const map = realMap();
  upsertObject(map, { name: 'chest', x: 1, foo: 'kept', components: { loot: { gold: 2 } } });
  const updated = upsertObject(map, { name: 'chest', x: 3, components: { loot: { open: false } } });
  assert.equal(updated.created, false);
  assert.deepEqual(updated.object, {
    name: 'chest', x: 3, foo: 'kept', components: { loot: { gold: 2, open: false } },
  });
  assert.deepEqual(rmObject(map, 'chest'), { removed: true });
});
