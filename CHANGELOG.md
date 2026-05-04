# Changelog

All notable changes to VScroll will be documented in this file.

## [0.0.1] - 2026-04-30

### Added
- Library tree view (Activity Bar) with persistent novels and chapters.
- Reader webview that opens chapters in a regular editor tab, themed with
  the editor's font, foreground, and background colors.
- Right-side minimap that mirrors the chapter, with a draggable viewport
  indicator (click or drag to scroll).
- Built-in **Novel Fire** plugin with search, full ToC, and chapter parsing.
- Plugins tree view with `Installed` and `Available` sections.
- One-click install of any plugin from `lnreader/lnreader-plugins`
  (108 plugins across 15 languages). Installer downloads the source,
  rewrites lnreader-specific imports to vscroll shims, and registers the
  plugin via an adapter.
- `VScroll: Read URL` command for arbitrary web articles, using Mozilla
  Readability for content extraction.
- Mark-read tracking, prev/next navigation, keyboard shortcuts
  (`J`/`→` next, `K`/`←` prev).
- Settings: `vscroll.userAgent`, `vscroll.fontSize`, `vscroll.fontFamily`,
  `vscroll.maxWidth`.
