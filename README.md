# VScroll

Read light novels and web articles inside VS Code.

VScroll adds an activity-bar panel with two views:

- **Library** — a tree of novels and chapters you've added. Click a chapter to open the reader in a regular editor tab.
- **Plugins** — list of available content sources from the [lnreader-plugins](https://github.com/lnreader/lnreader-plugins) GitHub repo, installable with one click.

A **NovelFire** plugin ships built-in. Anything else is fetched from GitHub on demand.

## Features

- Reader webview rendered in the editor area, themed to your VS Code colors. Keyboard shortcuts: `J` / `→` next, `K` / `←` prev.
- Per-source chapter extraction via plugins (clean HTML, no ads).
- Fallback to Mozilla Readability for arbitrary URLs (`VScroll: Read URL`).
- Persistent library across sessions (stored in `globalState`).
- Mark-read tracking per chapter.
- Configurable reader font, size, and max width.
- One-click install of any plugin from `lnreader/lnreader-plugins` (English and 14 other languages).

## Quick start

```bash
git clone <this-repo> vscroll
cd vscroll
npm install
code .
```

Then press **F5** to launch the Extension Development Host. In the new window:

1. Click the book icon in the activity bar.
2. **Plugins** → "Available" → expand a language → click a plugin row to install it.
3. Reload the window when prompted.
4. **Plugins** → "Installed" → click a plugin to browse / search it.
5. Pick a result → it's saved to your library with all chapters.
6. **Library** → click a chapter to read.

## Commands

| Command | What it does |
|---|---|
| `VScroll: Add Novel` | Add manually by URL or via a plugin search |
| `VScroll: Read URL` | Open any web article via Readability |
| `VScroll: Browse Plugin` | Search & add novels from an installed plugin |
| `VScroll: Install Plugin` | Fetch a plugin from GitHub and install it |
| `VScroll: Refresh Available Plugins` | Re-fetch the GitHub plugin list (cache: 1h) |

## Settings

| Key | Default | Notes |
|---|---|---|
| `vscroll.userAgent` | `Mozilla/5.0 (compatible; VScroll/0.1)` | Used for all outbound fetches |
| `vscroll.fontSize` | `16` | Reader font size (px) |
| `vscroll.fontFamily` | `Georgia, 'Times New Roman', serif` | Reader font |
| `vscroll.maxWidth` | `720` | Reader max content width (px) |

## How plugin install works

1. The Plugins view fetches `plugins/<lang>/` directory listings from `github.com/lnreader/lnreader-plugins` via the GitHub Contents API.
2. Clicking install:
   - Downloads the raw `.ts` source.
   - Rewrites `@libs/*` and `@/*` imports to point at `src/plugins/lnreader-shims.ts`, which re-exports `fetchApi`/`storage` from VScroll's runtime and provides `NovelStatus`, `FilterTypes`, `defaultCover`, etc.
   - Writes the rewritten file to `src/plugins/installed/<id>.ts`.
   - Regenerates `src/plugins/installed/index.ts` to include the new entry, wrapped in `adaptLnreaderPlugin()` (which normalizes the lnreader interface to VScroll's `VScrollPlugin` interface).
3. Reloading the dev host triggers a TypeScript recompile and the plugin shows up in the Installed list.

**Limitation:** install currently requires dev mode (the source tree must be writable). Production install (compiling TS at runtime in a packaged `.vsix`) is not yet implemented — see [Roadmap](#roadmap).

## Project layout

```
src/
├── extension.ts             ← activation + command registration
├── library.ts               ← TreeDataProvider for novels/chapters, storage
├── reader.ts                ← WebviewPanel + chapter rendering, single-instance
├── pluginsTree.ts           ← TreeDataProvider for installed/available plugins
└── plugins/
    ├── types.ts             ← VScrollPlugin interface (search/parseNovel/parseChapter)
    ├── runtime.ts           ← fetchApi + storage (used by all plugins)
    ├── lnreader-shims.ts    ← Plugin namespace + NovelStatus/FilterTypes/etc. for installed plugins
    ├── adapter.ts           ← Adapts an lnreader plugin to VScrollPlugin
    ├── registry.ts          ← Lists available plugins from GitHub (cached 1h)
    ├── installer.ts         ← Download → rewrite imports → write to installed/
    ├── index.ts             ← Built-in + installed plugin registry
    ├── novelfire.ts         ← Built-in plugin (manually ported)
    └── installed/
        ├── index.ts         ← AUTO-GENERATED — do not edit
        └── <id>.ts          ← Plugins installed from GitHub
```

## Writing a built-in plugin

Implement `VScrollPlugin` from `src/plugins/types.ts`:

```ts
export interface VScrollPlugin {
  id: string;
  name: string;
  site: string;
  searchNovels(term: string, page?: number): Promise<NovelItem[]>;
  parseNovel(path: string): Promise<SourceNovel>;
  parseChapter(path: string): Promise<string>;
}
```

`path` is whatever opaque identifier your plugin uses internally — usually a site-relative URL fragment. The chapter `path` round-trips back through `parseChapter()`.

Add the export to `src/plugins/index.ts`'s `builtins` array.

## Roadmap

- Production-mode plugin install (transpile TS to JS at runtime, load via `require()`).
- "Popular" browse mode that calls `popularNovels()` with default filters when supported.
- Cover thumbnails in the library tree.
- Reading progress (scroll position per chapter).
- EPUB export of saved chapters.
- Bundle with esbuild before publishing (current `node_modules` ship is huge — `jsdom` alone is ~5 MB).

## License

MIT.
