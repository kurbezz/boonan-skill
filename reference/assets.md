# Uploading binary assets

Images and sounds go up through `upload-file-project` as **raw bytes**. A
data-URL string is stored as literal text: the build still passes, but the
file is broken.

```sh
node cli.js upload img/Tilesets ./grass.png --register   # upload + add Register_Image node
node cli.js upload audio ./hit.wav --register
node cli.js upload ui/img ./button.png                    # UI textures need no registration
```

## What the command checks

- **Before sending:** the base name must match `[A-Za-z0-9_-]+` and have an
  extension. The file must be 5 MB or smaller. Its magic bytes must match the
  extension (png, jpg, gif, webp, wav, mp3, ogg). Images can't go into
  `audio/` and sounds can't go into `img/`. Data URLs are rejected.
- **After sending:** it re-lists the folder and compares the size the server
  reports with the local size. If they differ, it fails with
  `upload_corrupted` and suggests the other `--encoding`.

Matching sizes do not prove byte-for-byte integrity; open the asset in the
built game to complete visual/audio verification.

## Encoding

`--encoding binary` (the default) sends a latin1 byte string, the same as the
editor's `atob()` texture path. It was verified in a live sandbox upload: an
87-byte PNG received `uploaded-file-project` and was stored as 87 bytes.

`--encoding buffer` sends a socket.io binary attachment and remains available
for diagnosis. On that live-tested server, the same PNG sent as a Buffer timed
out after 60 seconds and no file was uploaded, so do not use `buffer` unless
you are specifically investigating server behavior. If verification reports
`upload_corrupted`, retry with the other encoding.

## Registration

A game node can only use an asset that is registered in `assets/*.json`.
`--register` adds this node, and skips it if an identical node is already
there:

| folder root | registry | schemaId | fieldValues |
|---|---|---|---|
| `img/...` | `assets/images.json` | `Register_Image_img__action` | `{name: "<path under img/ without ext>", ext}` |
| `audio/...` | `assets/audio.json` | `Register_Sound_audio__action` | `{name: "<path under audio/ without ext>", ext}` |
| `ui/img` | none | | reference as `/project_url/ui/img/<file>` in the UI scene |
| `maps/` | see map.md (`map register`) | `Register_Level_maps__action` | |

Nesting is kept: `img/Tilesets/grass.png` becomes name `Tilesets/grass`,
which is the name you pass to `Assets_Image_Asset__getter`.

## Limits

5 MB per file, about 10 MB per folder (enforced by the editor), and 15 MB
per project. Run `ls` to see current usage.
