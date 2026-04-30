import * as vscode from 'vscode';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { Chapter, LibraryProvider } from './library';
import { getPlugin } from './plugins';

export async function openReader(
  context: vscode.ExtensionContext,
  library: LibraryProvider,
  chapter: Chapter,
) {
  const panel = vscode.window.createWebviewPanel(
    'vscroll.reader',
    chapter.title,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  await loadChapter(panel, chapter);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === 'navigate') {
      const { prev, next } = library.neighbors(chapter);
      const target = msg.direction === 'prev' ? prev : next;
      if (!target) {
        vscode.window.showInformationMessage(
          `No ${msg.direction === 'prev' ? 'previous' : 'next'} chapter.`,
        );
        return;
      }
      chapter = target;
      panel.title = target.title;
      await loadChapter(panel, target);
    } else if (msg?.type === 'markRead') {
      await library.markRead(chapter);
    } else if (msg?.type === 'openExternal') {
      vscode.env.openExternal(vscode.Uri.parse(chapter.url));
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
    const html = chapter.pluginId && chapter.path
      ? await fetchWithPlugin(chapter.pluginId, chapter.path)
      : (await fetchAndExtract(chapter.url)).content;
    panel.webview.html = renderShell(chapter.title, html, true);
  } catch (err) {
    panel.webview.html = renderShell(
      chapter.title,
      renderError(err, chapter.url),
      true,
    );
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
  const fontSize = cfg.get<number>('fontSize') ?? 16;
  const fontFamily = cfg.get<string>('fontFamily') ?? 'Georgia, serif';
  const maxWidth = cfg.get<number>('maxWidth') ?? 720;

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
  body {
    max-width: ${maxWidth}px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    font-family: ${fontFamily};
    font-size: ${fontSize}px;
    line-height: 1.7;
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
  }
  h1, h2, h3 { line-height: 1.3; }
  h1 { font-size: 1.6em; margin-bottom: 1.5rem; }
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
    z-index: 1;
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
</style>
</head>
<body>
  ${controls}
  <h1>${escapeHtml(title)}</h1>
  <article>${body}</article>
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
