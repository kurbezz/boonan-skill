# boonan.io editor protocol

## Contents

- Connection
- Events
- Versioning
- Browser-side globals

## Connection

socket.io v4 over websocket. The server validates `Origin`; without it the
handshake fails with `connect_error: origin not allowed`. The project is
selected from the session cookie and `Referer`, not from a payload field.

```js
io('https://boonan.io', {
  transports: ['websocket'],
  extraHeaders: {
    Cookie: cookie,
    Origin: 'https://boonan.io',
    Referer: `https://boonan.io/project/${project}/node-editor`,
  },
});
```

Server-side response timeout is ~30 s. Error replies are objects like
`{error: "..."}`.

## Events

| emit | payload | reply |
|---|---|---|
| `read-folder-project` | - | `folder-contents-project` (tree: `{name, isDirectory, contents, size, protected}`) |
| `read-file-project` | `{folderName, fileName}` | `file-contents-project` `{folderName, fileName, content, version}` / `file-read-error` |
| `save-file-project` | `{folderName, fileName, content, baseVersion?}` | `file-saved-project` `{version}` / `file-save-error` |
| `create-file-project` | `{folderName, fileName, fileData}` | `created-file-project` |
| `upload-file-project` | `{folderName, fileName, fileData}` | `uploaded-file-project` |
| `delete-file-project` | `{folderName, fileName}` | `deleted-file-project` |
| `rename-file-project` | `{folderName, oldName, newName}` | `renamed-file-project` |
| `build-project` | `{title}` | `project-built` `{written[]}` / `project-build-error` |

`folderName` is `.` for project-root files.

There is no delta protocol: `save-file-project` carries the whole file. Split
large graphs into modules instead of optimising transport.

`upload-file-project` treats `fileData` as text. A PNG passed as a data URL
is stored as the literal string. Valid PNG starts with bytes
`137,80,78,71,13,10,26,10`.

`protected: true` (on `game.json`, `maps/*`, `assets/*`, `ui/main_menu.json`)
is enforced server-side; the client only reports it.

Built game: `https://boonan.io/projects/<id>/build/index.html`

## Versioning

`version` is the SHA-1 of the file content. Pass it back as `baseVersion` on
save. A stale `baseVersion` is rejected with a readable error; omitting it
lets a save overwrite concurrent changes silently and can leave a multi-file
edit half-applied.

## Browser-side globals

Only relevant when scripting inside the editor page.

- `SDK.Events` - local event bus (not network): `editor-save-request` /
  `editor-save-done` (equivalent to Ctrl+S), `project-built`,
  `node-add|update|remove|move`, `scene-change`.
- `NodeEditorApi.NodeRegistry` - `search`, `get`, `getByCategory`.
- `UIEditorSchema` - `makeDefaultScene`, `makeNode`, `normalizeScene`.
  UI scene shape: `{schema: 1, type: "ui-scene", canvas: {width, height}, nodes: []}`.
- Editor bundles are served statically without auth (obfuscator.io +
  splitStrings).
