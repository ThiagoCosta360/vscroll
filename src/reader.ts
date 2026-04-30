import * as vscode from 'vscode';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { Chapter, LibraryProvider } from './library';
import { getPlugin } from './plugins';

interface ReaderState {
  panel: vscode.WebviewPanel;
  chapter: Chapter;
}

let activeReader: ReaderState | undefined;

export async function openReader(
  _context: vscode.ExtensionContext,
  library: LibraryProvider,
  chapter: Chapter,
) {
  if (activeReader) {
    activeReader.chapter = chapter;
    activeReader.panel.title = chapter.title;
    activeReader.panel.reveal(activeReader.panel.viewColumn ?? vscode.ViewColumn.Active, false);
    await loadChapter(activeReader.panel, chapter);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'vscroll.reader',
    chapter.title,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const state: ReaderState = { panel, chapter };
  activeReader = state;

  panel.onDidDispose(() => {
    if (activeReader === state) activeReader = undefined;
  });

  await loadChapter(panel, chapter);

  panel.webview.onDidReceiveMessage(async (msg) => {
    const current = state.chapter;
    if (msg?.type === 'navigate') {
      const { prev, next } = library.neighbors(current);
      const target = msg.direction === 'prev' ? prev : next;
      if (!target) {
        vscode.window.showInformationMessage(
          `No ${msg.direction === 'prev' ? 'previous' : 'next'} chapter.`,
        );
        return;
      }
      state.chapter = target;
      panel.title = target.title;
      await loadChapter(panel, target);
    } else if (msg?.type === 'markRead') {
      await library.markRead(current);
    } else if (msg?.type === 'openExternal') {
      vscode.env.openExternal(vscode.Uri.parse(current.url));
    }
  });
}

export async function openUrlReader(_context: vscode.ExtensionContext) {
  const url = await vscode.window.showInputBox({
    prompt: 'URL to read',
    placeHolder: 'https://...',
    ignoreFocusOut: true,
  });
  if (!url) return;
  const panel = vscode.window.createWebviewPanel(
    'vscroll.reader',
    'VScroll',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  await loadFromUrl(panel, 'Loading…', url);
}

async function loadChapter(panel: vscode.WebviewPanel, chapter: Chapter) {
  panel.webview.html = renderShell(chapter.title, '<p style="opacity:.6">Loading…</p>', false);
  try {
    const html =
      chapter.pluginId && chapter.path
        ? await fetchWithPlugin(chapter.pluginId, chapter.path)
        : (await fetchAndExtract(chapter.url)).content;
    panel.webview.html = renderShell(chapter.title, html, true);
  } catch (err) {
    panel.webview.html = renderShell(chapter.title, renderError(err, chapter.url), true);
  }
}

async function loadFromUrl(panel: vscode.WebviewPanel, title: string, url: string) {
  panel.webview.html = renderShell(title, '<p style="opacity:.6">Loading…</p>', false);
  try {
    const { content, articleTitle } = await fetchAndExtract(url);
    panel.title = articleTitle ?? title;
    panel.webview.html = renderShell(articleTitle ?? title, content, false);
  } catch (err) {
    panel.webview.html = renderShell(title, renderError(err, url), false);
  }
}

async function fetchWithPlugin(pluginId: string, path: string): Promise<string> {
  const plugin = getPlugin(pluginId);
  if (!plugin) throw new Error(`Plugin "${pluginId}" not found`);
  return plugin.parseChapter(path);
}

async function fetchAndExtract(url: string): Promise<{ content: string; articleTitle?: string }> {
  const cfg = vscode.workspace.getConfiguration('vscroll');
  const ua = cfg.get<string>('userAgent') ?? 'Mozilla/5.0 VScroll';
  const res = await fetch(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article?.content) throw new Error('Could not extract readable content from this page.');
  return { content: article.content, articleTitle: article.title ?? undefined };
}

function renderShell(title: string, body: string, withControls: boolean): string {
  const cfg = vscode.workspace.getConfiguration('vscroll');
  const fontSizeNum = cfg.get<number>('fontSize') ?? 0;
  const fontSizeCss = fontSizeNum > 0 ? `${fontSizeNum}px` : 'var(--vscode-editor-font-size)';
  const fontFamilyCfg = cfg.get<string>('fontFamily') ?? '';
  const fontFamilyCss =
    fontFamilyCfg ||
    "var(--vscode-editor-font-family), 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Source Code Pro', Menlo, Monaco, Consolas, 'Courier New', monospace";
  const maxWidth = cfg.get<number>('maxWidth') ?? 800;

  const controls = withControls
    ? `<nav class="vscroll-nav">
         <button data-action="prev">← Prev</button>
         <button data-action="markRead">Mark read</button>
         <button data-action="openExternal">Open in browser</button>
         <button data-action="next">Next →</button>
       </nav>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
  :root {
    --vscroll-minimap-w: 120px;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: ${fontFamilyCss};
    font-size: ${fontSizeCss};
  }
  body {
    padding-right: var(--vscroll-minimap-w);
  }
  /* Force the editor font on all rendered text — chapter HTML often
     contains inline font-family rules from the source site. */
  body, body *, .vscroll-page, .vscroll-page * {
    font-family: ${fontFamilyCss} !important;
  }
  .vscroll-page {
    max-width: ${maxWidth}px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    line-height: 1.6;
  }
  h1, h2, h3 { line-height: 1.3; }
  h1 { font-size: 1.5em; margin-bottom: 1.5rem; }
  p { margin: 0 0 1em; }
  img { max-width: 100%; height: auto; }
  a { color: var(--vscode-textLink-foreground); }
  blockquote { border-left: 3px solid var(--vscode-textBlockQuote-border); padding-left: 1em; opacity: .85; }
  .vscroll-nav {
    position: sticky;
    top: 0;
    display: flex;
    gap: .5rem;
    padding: .5rem 0 1rem;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-editorWidget-border);
    margin-bottom: 1.5rem;
    z-index: 2;
  }
  .vscroll-nav button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent);
    padding: .35rem .7rem;
    cursor: pointer;
    border-radius: 3px;
    font: inherit;
  }
  .vscroll-nav button:hover { background: var(--vscode-button-secondaryHoverBackground); }

  /* Minimap */
  .vscroll-minimap {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--vscroll-minimap-w);
    background: var(--vscode-editor-background);
    border-left: 1px solid var(--vscode-editorWidget-border);
    overflow: hidden;
    cursor: pointer;
    z-index: 5;
    user-select: none;
  }
  .vscroll-minimap-content {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
    pointer-events: none;
    color: var(--vscode-editor-foreground);
    opacity: 0.55;
    font-family: ${fontFamilyCss};
    line-height: 1.6;
  }
  .vscroll-minimap-content * { color: inherit !important; background: transparent !important; }
  .vscroll-minimap-content img { display: none; }
  .vscroll-minimap-viewport {
    position: absolute;
    left: 0;
    right: 0;
    background: var(--vscode-scrollbarSlider-background);
    opacity: 0.4;
    pointer-events: none;
    transition: opacity .1s;
  }
  .vscroll-minimap:hover .vscroll-minimap-viewport { opacity: 0.6; }
</style>
</head>
<body>
  <div class="vscroll-page">
    ${controls}
    <h1>${escapeHtml(title)}</h1>
    <article>${body}</article>
  </div>
  <div class="vscroll-minimap" id="vscrollMinimap">
    <div class="vscroll-minimap-content" id="vscrollMinimapContent"></div>
    <div class="vscroll-minimap-viewport" id="vscrollMinimapViewport"></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.vscroll-nav button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'prev' || action === 'next') {
          vscode.postMessage({ type: 'navigate', direction: action });
        } else if (action === 'markRead') {
          vscode.postMessage({ type: 'markRead' });
          btn.textContent = 'Marked ✓';
        } else if (action === 'openExternal') {
          vscode.postMessage({ type: 'openExternal' });
        }
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'j' || e.key === 'ArrowRight') vscode.postMessage({ type: 'navigate', direction: 'next' });
      else if (e.key === 'k' || e.key === 'ArrowLeft') vscode.postMessage({ type: 'navigate', direction: 'prev' });
    });

    // Minimap
    const page = document.querySelector('.vscroll-page');
    const minimap = document.getElementById('vscrollMinimap');
    const mmContent = document.getElementById('vscrollMinimapContent');
    const mmViewport = document.getElementById('vscrollMinimapViewport');

    let scale = 0.15;

    function buildMinimap() {
      mmContent.innerHTML = page.innerHTML;
      // strip the sticky nav from minimap clone
      const navClone = mmContent.querySelector('.vscroll-nav');
      if (navClone) navClone.remove();
      fitMinimap();
    }

    function fitMinimap() {
      const docHeight = page.scrollHeight;
      const pageWidth = page.clientWidth;
      const mmWidth = minimap.clientWidth;
      const mmHeight = minimap.clientHeight;
      if (!docHeight || !pageWidth) return;
      const scaleX = mmWidth / pageWidth;
      const scaleY = mmHeight / docHeight;
      scale = Math.min(scaleX, scaleY, 0.25);
      mmContent.style.width = pageWidth + 'px';
      mmContent.style.transform = 'scale(' + scale + ')';
      updateViewport();
    }

    function updateViewport() {
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      const scrollTop = window.scrollY;
      const mmHeight = minimap.clientHeight;
      const ratio = mmHeight / docHeight;
      mmViewport.style.top = (scrollTop * ratio) + 'px';
      mmViewport.style.height = Math.max(20, winHeight * ratio) + 'px';
    }

    minimap.addEventListener('mousedown', startDrag);
    function startDrag(e) {
      jumpTo(e.clientY);
      const move = (ev) => jumpTo(ev.clientY);
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }
    function jumpTo(clientY) {
      const rect = minimap.getBoundingClientRect();
      const ratio = (clientY - rect.top) / rect.height;
      const docHeight = document.documentElement.scrollHeight;
      window.scrollTo({ top: ratio * docHeight - window.innerHeight / 2 });
    }

    window.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', fitMinimap);
    if (document.readyState === 'complete') buildMinimap();
    else window.addEventListener('load', buildMinimap);
  </script>
</body>
</html>`;
}

function renderError(err: unknown, url: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `<p style="color:var(--vscode-errorForeground)">Failed to load: ${escapeHtml(msg)}</p>
          <p><a href="${escapeHtml(url)}">Open in browser</a></p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
