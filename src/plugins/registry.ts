import * as vscode from 'vscode';

export interface AvailablePlugin {
  id: string;
  language: string;
  filename: string;
  rawUrl: string;
  htmlUrl: string;
}

const REPO_API = 'https://api.github.com/repos/lnreader/lnreader-plugins/contents/plugins';
const CACHE_KEY = 'vscroll.availablePlugins.cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface GhEntry {
  name: string;
  type: 'file' | 'dir' | string;
  path: string;
  download_url: string | null;
  html_url: string | null;
}

interface CacheShape {
  fetchedAt: number;
  plugins: AvailablePlugin[];
}

export async function listAvailablePlugins(
  context: vscode.ExtensionContext,
  forceRefresh = false,
): Promise<AvailablePlugin[]> {
  if (!forceRefresh) {
    const cached = context.globalState.get<CacheShape>(CACHE_KEY);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.plugins;
    }
  }

  const langs = await ghJson<GhEntry[]>(REPO_API);
  const dirs = langs.filter((e) => e.type === 'dir').map((e) => e.name);

  const plugins: AvailablePlugin[] = [];
  for (const lang of dirs) {
    try {
      const files = await ghJson<GhEntry[]>(`${REPO_API}/${encodeURIComponent(lang)}`);
      for (const f of files) {
        if (f.type !== 'file' || !f.name.endsWith('.ts')) continue;
        if (!f.download_url) continue;
        const id = f.name.replace(/\.ts$/, '');
        plugins.push({
          id,
          language: lang,
          filename: f.name,
          rawUrl: f.download_url,
          htmlUrl: f.html_url ?? '',
        });
      }
    } catch (err) {
      console.warn(`[vscroll] Failed to list plugins for ${lang}:`, err);
    }
  }

  await context.globalState.update(CACHE_KEY, {
    fetchedAt: Date.now(),
    plugins,
  } satisfies CacheShape);
  return plugins;
}

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vscroll-vscode-extension',
    },
  });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('GitHub rate limit exceeded. Try again in an hour.');
    }
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchPluginSource(plugin: AvailablePlugin): Promise<string> {
  const res = await fetch(plugin.rawUrl, {
    headers: { 'User-Agent': 'vscroll-vscode-extension' },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${plugin.filename}: HTTP ${res.status}`);
  return res.text();
}
