'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateScene,
  makeScene,
  makeLayer,
  findLayer,
} = require('../ui-scene');

test('creates and validates a scene with a parented layer', () => {
  const scene = makeScene();
  const parent = makeLayer({ id: 'parent', name: 'Parent', isGroup: true });
  const child = makeLayer({ id: 'child', name: 'Child', parent: parent.id });
  scene.nodes.push(parent, child);
  assert.deepEqual(validateScene(scene, 'ui/test.json'), []);
  assert.strictEqual(findLayer(scene, 'parent'), parent);
  assert.strictEqual(findLayer(scene, 'Child'), child);
});

test('findLayer rejects an ambiguous duplicate name', () => {
  const scene = makeScene();
  scene.nodes.push(makeLayer({ id: 'one', name: 'same' }), makeLayer({ id: 'two', name: 'same' }));
  assert.throws(() => findLayer(scene, 'same'), /ambiguous layer name: same/);
});

test('validateScene rejects invalid anchor direction and color', () => {
  const scene = makeScene();
  scene.nodes.push(makeLayer({
    id: 'bad', name: 'bad',
    anchor: { direction: 'diagonal' },
    background: { fillColor: 'red' },
  }));
  const problems = validateScene(scene, 'ui/test.json').join('\n');
  assert.match(problems, /anchor.direction/);
  assert.match(problems, /background.fillColor is not hex/);
});
