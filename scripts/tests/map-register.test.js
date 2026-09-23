'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerMap } = require('../cli');

function fakeB(graphs) {
  const calls = { createFile: 0, edits: [] };
  return {
    calls,
    async listFiles() { return Object.keys(graphs).map(file => ({ path: `assets/${file}` })); },
    async readGraph(folder, file) {
      assert.equal(folder, 'assets');
      return { graph: graphs[file], version: 1 };
    },
    async edit(folder, file, mutate) {
      assert.equal(folder, 'assets');
      calls.edits.push(file);
      mutate(graphs[file]);
      return { version: 2 };
    },
    async createFile() { calls.createFile++; },
  };
}

test('uses an existing asset graph without creating levels.json and deduplicates', async () => {
  const b = fakeB({ 'images.json': { nodes: [], links: [] } });
  const first = await registerMap(b, 'level_1');
  assert.equal(first.registered, true);
  assert.equal(first.file, 'images.json');
  assert.equal(b.calls.createFile, 0);
  assert.deepEqual(b.calls.edits, ['images.json']);

  const second = await registerMap(b, 'level_1');
  assert.deepEqual(second, { registered: false, reason: 'exists', file: 'images.json', nodeId: first.nodeId });
  assert.deepEqual(b.calls.edits, ['images.json']);
  assert.equal(b.calls.createFile, 0);
});

test('does not create a registry when no asset graphs exist', async () => {
  const b = fakeB({});
  await assert.rejects(registerMap(b, 'level_1'), error =>
    error.code === 'assets_registry_missing' && /create an asset registry explicitly/i.test(error.message));
  assert.equal(b.calls.createFile, 0);
  assert.deepEqual(b.calls.edits, []);
});

test('prefers an existing levels.json registry', async () => {
  const b = fakeB({
    'images.json': { nodes: [], links: [] },
    'levels.json': { nodes: [], links: [] },
  });
  const result = await registerMap(b, 'level_1');
  assert.equal(result.file, 'levels.json');
  assert.deepEqual(b.calls.edits, ['levels.json']);
  assert.equal(b.calls.createFile, 0);
});

test('validates a local map preset without a cookie or project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boonan-preset-'));
  try {
    const file = path.join(dir, 'preset.json');
    fs.writeFileSync(file, JSON.stringify({
      version: 1, name: 'probe', size: { w: 32, h: 32 }, sprite: null, colliders: [],
    }));
    const env = { ...process.env };
    delete env.BOONAN_COOKIE;
    delete env.BOONAN_PROJECT;
    const run = spawnSync(process.execPath, [path.join(__dirname, '../cli.js'),
      'map', 'preset', 'validate', file, '--local'], { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(JSON.parse(run.stdout).ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
