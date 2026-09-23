'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  sniffType,
  encodeFileData,
  upload,
} = require('../upload');

const samples = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  gif: Buffer.from('GIF89a', 'latin1'),
  webp: Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'),
  wav: Buffer.from('RIFF\0\0\0\0WAVE', 'latin1'),
  mp3: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
  ogg: Buffer.from('OggS', 'latin1'),
};

for (const [type, buf] of Object.entries(samples)) {
  assert.strictEqual(sniffType(buf), type, `sniffs ${type} magic bytes`);
}

const bytes = Buffer.from([0xff, 0x00]);
assert.strictEqual(encodeFileData(bytes), '\xff\0', 'default encoding is latin1 binary');
assert(Buffer.isBuffer(encodeFileData(bytes, 'buffer')), 'explicit buffer is retained for diagnosis');

(async () => {
  let payload;
  const result = await upload({
    _rpc: async (_event, sent) => { payload = sent; },
    listFiles: async () => [{ path: 'img/test.png', size: samples.png.length }],
  }, { folder: 'img', fileName: 'test.png', buf: samples.png });
  assert.strictEqual(typeof payload.fileData, 'string', 'upload defaults to binary string payload');
  assert.strictEqual(result.encoding, 'binary', 'upload result reports default binary encoding');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boonan-upload-test-'));
  const localFile = path.join(tempDir, 'test.png');
  try {
    fs.writeFileSync(localFile, samples.png);
    const stdout = execFileSync(process.execPath, ['cli.js', 'upload', 'img', localFile, '--dry-run'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    assert.strictEqual(JSON.parse(stdout).encoding, 'binary', 'CLI upload --dry-run defaults to binary');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('upload.test.js: passed');
})().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
