import * as vscode from 'vscode';

let runtimeContext: vscode.ExtensionContext | undefined;

export function setRuntimeContext(ctx: vscode.ExtensionContext) {
  runtimeContext = ctx;
}

export async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  const ua =
    vscode.workspace.getConfiguration('vscroll').get<string>('userAgent') ??
    'Mozilla/5.0 (compatible; VScroll/0.1)';
  const headers = new Headers(init?.headers);
  if (!headers.has('User-Agent')) headers.set('User-Agent', ua);
  if (!headers.has('Accept')) headers.set('Accept', '*/*');
  return fetch(url, { ...init, headers });
}

const STORAGE_KEY = 'vscroll.plugins.kv';
const memCache = new Map<string, string>();

export const storage = {
  get(key: string): string | undefined {
    if (memCache.has(key)) return memCache.get(key);
    const all = runtimeContext?.globalState.get<Record<string, string>>(STORAGE_KEY, {}) ?? {};
    return all[key];
  },
  set(key: string, value: string): void {
    memCache.set(key, value);
    if (!runtimeContext) return;
    const all = runtimeContext.globalState.get<Record<string, string>>(STORAGE_KEY, {}) ?? {};
    all[key] = value;
    void runtimeContext.globalState.update(STORAGE_KEY, all);
  },
};
