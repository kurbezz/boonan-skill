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

## Encoding

`--encoding buffer` (the default) sends a socket.io binary attachment, which
is the same bytes the editor gets from `FileReader.readAsArrayBuffer`.
`--encoding binary` sends a latin1 byte string, the same as the editor's
`atob()` texture path. Which one the server stores correctly is **not yet
confirmed live**. If you get `upload_corrupted`, retry with the other
encoding and note which one worked.

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
