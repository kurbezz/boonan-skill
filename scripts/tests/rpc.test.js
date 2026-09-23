'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Boonan, BoonanError } = require('../client');

class FakeSocket {
  constructor() {
    this.connected = true;
    this.listeners = new Map();
    this.sent = [];
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event, listener) {
    this.listeners.set(event, (this.listeners.get(event) || []).filter(fn => fn !== listener));
    return this;
  }

  emit(event, payload) { this.sent.push({ event, payload }); return this; }
  reply(event, payload) { for (const fn of [...(this.listeners.get(event) || [])]) fn(payload); }
  close() {
    this.connected = false;
    this.reply('disconnect', 'io client disconnect');
  }
}

function client(socket, timeout = 50) {
  const b = new Boonan({ cookie: 'test', project: 'project', timeout });
  b.socket = socket;
  return b;
}

test('serializes same-response-event reads and preserves their matching replies', async () => {
  const socket = new FakeSocket();
  const b = client(socket);
  const images = b.readFile('assets', 'images.json');
  const level = b.readFile('maps', 'level_1.json');

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(socket.sent, [{ event: 'read-file-project', payload: { folderName: 'assets', fileName: 'images.json' } }]);
  socket.reply('file-contents-project', { content: 'images', version: 'v-images' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(socket.sent[1], { event: 'read-file-project', payload: { folderName: 'maps', fileName: 'level_1.json' } });
  socket.reply('file-contents-project', { content: 'level', version: 'v-level' });

  assert.deepEqual(await Promise.all([images, level]), [
    { content: 'images', version: 'v-images', folder: 'assets', name: 'images.json' },
    { content: 'level', version: 'v-level', folder: 'maps', name: 'level_1.json' },
  ]);
});

test('timeout invalidates the socket and queued calls fail until explicitly reconnected', async () => {
  const socket = new FakeSocket();
  const b = client(socket, 10);
  const timedOut = b.readFile('assets', 'slow.json');
  const queued = b.readFile('maps', 'queued.json');

  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(timedOut, error => error instanceof BoonanError && error.code === 'timeout');
  await assert.rejects(queued, error => error instanceof BoonanError && error.code === 'disconnected');
  assert.equal(socket.sent.length, 1);

  const reconnected = new FakeSocket();
  b.socket = reconnected;
  const next = b.readFile('maps', 'after-reconnect.json');
  await new Promise(resolve => setImmediate(resolve));
  reconnected.reply('file-contents-project', { content: 'fresh', version: 'v-fresh' });
  assert.deepEqual(await next, { content: 'fresh', version: 'v-fresh', folder: 'maps', name: 'after-reconnect.json' });
});

test('server errors release the RPC queue for the next request', async () => {
  const socket = new FakeSocket();
  const b = client(socket);
  const failed = b.readFile('assets', 'missing.json');
  const next = b.readFile('maps', 'level_1.json');

  await new Promise(resolve => setImmediate(resolve));
  socket.reply('file-read-error', { error: 'missing' });
  await assert.rejects(failed, error => error instanceof BoonanError && error.code === 'server_error');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(socket.sent.length, 2);
  socket.reply('file-contents-project', { content: 'level', version: 'v-level' });
  assert.equal((await next).content, 'level');
});
