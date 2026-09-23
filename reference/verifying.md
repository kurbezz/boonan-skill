# Verifying a build by screenshot

A green `build` only means the files were written. Always open the game URL
and check pixels.

## Canvas layers

| id | context | z |
|---|---|---|
| `ui` | 2d | 3 |
| `debug` | 2d | 2 |
| `world` | webgl | 1 |

`world.getContext('2d')` returns `null`. Copy it via a temporary canvas:

```js
const src = document.getElementById('world');
const tmp = document.createElement('canvas');
tmp.width = src.width; tmp.height = src.height;
tmp.getContext('2d').drawImage(src, 0, 0);
const px = tmp.getContext('2d').getImageData(0, 0, tmp.width, tmp.height);
```

## Coordinates

`devicePixelRatio` is typically 2, so canvas pixels are 2x CSS pixels.
Convert with `getBoundingClientRect()` before clicking. Coordinates reported
by the in-page UI bridge are unreliable - locate buttons by fill colour in
the pixel buffer instead.

## Checks

- **Player present**: the player is camera-locked at screen centre. Count
  non-background pixels in a box around the centre.
- **Background rejection**: the floor tiles with a 256 px period. A pixel
  equal to the one at `x + 256` is background.
- **Asset actually binary**: a texture rendering as `data:ima...` text means
  a data URL was uploaded as a string (see protocol.md).
