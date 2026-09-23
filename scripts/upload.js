'use strict';
/**
 * boonan.io — asset upload helpers on top of the editor's socket.io protocol.
 *
 * Handles: sniffing a file's real type from its bytes, pre-flight validation
 * against the server's known rules, encoding the payload for upload,
 * uploading with post-write verification, and registering the resulting
 * asset in assets/images.json or assets/audio.json.
 */
const { BoonanError, addNode } = require('./client');

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const BASE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

const IMAGE_TYPES = new Set(['png', 'jpg', 'gif', 'webp']);
const AUDIO_TYPES = new Set(['wav', 'mp3', 'ogg']);

/**
 * Detect a file's real type from its magic bytes.
 * @param {Buffer} buf
 * @returns {'png'|'jpg'|'gif'|'webp'|'wav'|'mp3'|'ogg'|null}
 */
function sniffType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';

  // GIF: "GIF8"
  if (buf.slice(0, 4).toString('latin1') === 'GIF8') return 'gif';

  // RIFF containers: WEBP / WAVE
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF') {
    const kind = buf.slice(8, 12).toString('latin1');
    if (kind === 'WEBP') return 'webp';
    if (kind === 'WAVE') return 'wav';
  }

  // MP3: "ID3" tag, or a frame sync (top 11 bits set: FF Ex/Fx)
  if (buf.slice(0, 3).toString('latin1') === 'ID3') return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';

  // OGG: "OggS"
  if (buf.slice(0, 4).toString('latin1') === 'OggS') return 'ogg';

  return null;
}

/** Normalize an extension for comparison purposes (jpeg == jpg). */
function normalizeExt(ext) {
  const e = String(ext || '').toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
}

/** Split "fileName" into {base, ext} the way the server's own regex does. */
function splitName(fileName) {
  const m = /\.[^/.]+$/.exec(fileName);
  if (!m) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, m.index), ext: fileName.slice(m.index + 1) };
}

/**
 * Pre-flight checks for an upload. Returns an array of problem strings
 * (empty means "looks fine").
 * @param {object} opts
 * @param {string} opts.folder
 * @param {string} opts.fileName
 * @param {Buffer} opts.buf
 * @returns {string[]}
 */
function checkUpload({ folder, fileName, buf }) {
  const problems = [];

  if (Buffer.isBuffer(buf) && buf.slice(0, 5).toString('latin1') === 'data:') {
    problems.push('buffer looks like a data URL - pass the raw file bytes');
  }

  const { base, ext } = splitName(fileName || '');
  if (!base || !BASE_NAME_RE.test(base)) {
    problems.push(`file base name "${base}" must match ${BASE_NAME_RE}`);
  }
  if (!ext) {
    problems.push(`fileName "${fileName}" has no extension`);
  }

  if (!Buffer.isBuffer(buf)) {
    problems.push('buf must be a Buffer');
    return problems;
  }

  if (buf.length > MAX_FILE_BYTES) {
    problems.push(`file is ${buf.length} bytes, exceeds the 5 MB per-file limit (${MAX_FILE_BYTES} bytes)`);
  }

  const sniffed = sniffType(buf);
  if (sniffed === null) {
    problems.push('could not sniff a known file type from the buffer\'s magic bytes');
  } else if (ext) {
    const wantExt = normalizeExt(ext);
    const gotExt = normalizeExt(sniffed);
    if (wantExt !== gotExt) {
      problems.push(`extension says "${ext}" but sniffed content type is "${sniffed}"`);
    }

    const root = String(folder || '').split('/')[0];
    if (IMAGE_TYPES.has(sniffed) && root === 'audio') {
      problems.push(`"${sniffed}" looks like an image, cannot upload into audio/`);
    }
    if (AUDIO_TYPES.has(sniffed) && (root === 'img' || String(folder || '').startsWith('ui/img'))) {
      problems.push(`"${sniffed}" looks like an audio file, cannot upload into ${folder}`);
    }
  }

  return problems;
}

/**
 * Encode a buffer for the `fileData` field of `upload-file-project`.
 * @param {Buffer} buf
 * `binary` is the default because it is the encoding verified against the
 * live server. `buffer` remains available for diagnosis.
 * @param {'buffer'|'binary'} [encoding='binary']
 * @returns {Buffer|string}
 */
function encodeFileData(buf, encoding = 'binary') {
  if (encoding === 'binary') return buf.toString('latin1');
  return buf;
}

/**
 * Upload a file and (by default) verify the server stored the right number
 * of bytes.
 * @param {import('./client').Boonan} b
 * @param {object} opts
 * @param {string} opts.folder
 * @param {string} opts.fileName
 * @param {Buffer} opts.buf
 * @param {'buffer'|'binary'} [opts.encoding='binary']
 * @param {boolean} [opts.verify=true]
 */
async function upload(b, opts) {
  const { folder, fileName, buf, encoding = 'binary', verify = true } = opts;

  const problems = checkUpload({ folder, fileName, buf });
  if (problems.length) {
    throw new BoonanError('upload failed validation:\n  ' + problems.join('\n  '), 'invalid_upload', problems);
  }

  await b._rpc('upload-file-project',
    { folderName: folder, fileName, fileData: encodeFileData(buf, encoding) },
    'uploaded-file-project', 'upload-error', 60000);

  const type = sniffType(buf);
  const result = { folder, fileName, bytes: buf.length, type, encoding, remoteSize: undefined, sizeMatch: undefined };

  if (verify) {
    const files = await b.listFiles();
    const wantPath = `${folder}/${fileName}`;
    const found = files.find(f => f.path === wantPath);
    if (!found) {
      throw new BoonanError(`upload of ${wantPath} appears to have succeeded but the file is missing from the file list`, 'upload_missing');
    }
    result.remoteSize = found.size;
    result.sizeMatch = found.size === buf.length;
    if (!result.sizeMatch) {
      const other = encoding === 'binary' ? 'buffer' : 'binary';
      throw new BoonanError(
        `server stored ${found.size} bytes, local file is ${buf.length}; retry with --encoding ${other}`,
        'upload_corrupted');
    }
  }

  return result;
}

/**
 * Compute the asset-registration node needed for a freshly uploaded file,
 * or null if the folder doesn't require registration (ui/img, maps, objects,
 * and anything outside img/... or audio/...).
 * @param {string} folder
 * @param {string} fileName
 * @returns {null|{registryFile: 'images.json'|'audio.json', schemaId: string, fieldValues: {name: string, ext: string}}}
 */
function assetRegistration(folder, fileName) {
  const parts = String(folder || '').split('/');
  const root = parts[0];
  if (root !== 'img' && root !== 'audio') return null;
  if (folder === 'ui/img' || String(folder).startsWith('ui/img/')) return null;

  const { base, ext } = splitName(fileName);
  const rest = parts.slice(1).join('/');
  const name = rest ? `${rest}/${base}` : base;

  if (root === 'img') {
    return {
      registryFile: 'images.json',
      schemaId: 'Register_Image_img__action',
      fieldValues: { name, ext },
    };
  }
  return {
    registryFile: 'audio.json',
    schemaId: 'Register_Sound_audio__action',
    fieldValues: { name, ext },
  };
}

/** Create assets/<registryFile> with an empty graph if it doesn't exist yet. */
async function ensureRegistryFile(b, registryFile) {
  try {
    await b.readFile('assets', registryFile);
  } catch (e) {
    const notFound = /not.?found|no such file|enoent|does not exist/i.test(e.message || '');
    if (!notFound) throw e;
    await b.createFile('assets', registryFile, '{"nodes":[],"links":[]}');
  }
}

/**
 * Register an uploaded asset in assets/images.json or assets/audio.json.
 * No-op if a node with the same schemaId + fieldValues.name already exists.
 * @param {import('./client').Boonan} b
 * @param {ReturnType<typeof assetRegistration>} reg
 */
async function register(b, reg) {
  await ensureRegistryFile(b, reg.registryFile);

  let createdNode = null;
  let existingId = null;

  const r = await b.edit('assets', reg.registryFile, (graph) => {
    createdNode = null;
    existingId = null;
    const nodes = graph.nodes || (graph.nodes = []);
    const dup = nodes.find(n => n.schemaId === reg.schemaId &&
      n.fieldValues && n.fieldValues.name === reg.fieldValues.name);
    if (dup) { existingId = dup.id; return graph; }
    createdNode = addNode(graph, {
      schemaId: reg.schemaId,
      x: 0,
      y: 40 * nodes.length,
      fieldValues: reg.fieldValues,
    });
    return graph;
  });
  void r;

  if (existingId) return { registered: false, reason: 'exists', nodeId: existingId };
  return { registered: true, nodeId: createdNode.id, registryFile: reg.registryFile };
}

module.exports = {
  sniffType,
  checkUpload,
  encodeFileData,
  upload,
  assetRegistration,
  register,
};
