import * as vscode from 'vscode';
import { getPlugin, plugins } from './plugins';

export interface Chapter {
  url: string;
  title: string;
  novelId: string;
  read?: boolean;
  pluginId?: string;
  path?: string;
}

export interface Novel {
  id: string;
  url: string;
  title: string;
  chapters: Chapter[];
  pluginId?: string;
  path?: string;
  cover?: string;
  author?: string;
  summary?: string;
}

const STORAGE_KEY = 'vscroll.library.v1';

type TreeItem = NovelNode | ChapterNode;

class NovelNode {
  readonly kind = 'novel' as const;
  constructor(public novel: Novel) {}
}

class ChapterNode {
  readonly kind = 'chapter' as const;
  constructor(public chapter: Chapter) {}
}

export class LibraryProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChange = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private context: vscode.ExtensionContext) {}

  private get novels(): Novel[] {
    return this.context.globalState.get<Novel[]>(STORAGE_KEY, []);
  }

  private async saveNovels(novels: Novel[]) {
    await this.context.globalState.update(STORAGE_KEY, novels);
    this.refresh();
  }

  refresh() {
    this._onDidChange.fire(undefined);
  }

  getTreeItem(node: TreeItem): vscode.TreeItem {
    if (node.kind === 'novel') {
      const item = new vscode.TreeItem(
        node.novel.title,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = new vscode.ThemeIcon('book');
      item.contextValue = 'novel';
      item.id = `novel:${node.novel.id}`;
      item.tooltip = node.novel.url;
      const tag = node.novel.pluginId ? ` · ${node.novel.pluginId}` : '';
      item.description = `${node.novel.chapters.length} ch${tag}`;
      return item;
    }
    const item = new vscode.TreeItem(node.chapter.title, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(node.chapter.read ? 'check' : 'circle-outline');
    item.contextValue = 'chapter';
    item.tooltip = node.chapter.url;
    item.command = {
      command: 'vscroll.openChapter',
      title: 'Read',
      arguments: [node.chapter],
    };
    return item;
  }

  getChildren(node?: TreeItem): TreeItem[] {
    if (!node) return this.novels.map((n) => new NovelNode(n));
    if (node.kind === 'novel') return node.novel.chapters.map((c) => new ChapterNode(c));
    return [];
  }

  async addNovel() {
    type Choice = vscode.QuickPickItem &
      ({ source: 'url' } | { source: 'plugin'; pluginId: string });
    const urlChoice: Choice = {
      source: 'url',
      label: '$(link) Add by URL',
      description: 'Manual — paste chapter URLs yourself',
    };
    const pluginChoices: Choice[] = plugins.map((p) => ({
      source: 'plugin',
      pluginId: p.id,
      label: `$(search) Search ${p.name}`,
      description: p.site,
    }));
    const pick = await vscode.window.showQuickPick<Choice>(
      [urlChoice, ...pluginChoices],
      { placeHolder: 'Add novel from…' },
    );
    if (!pick) return;
    if (pick.source === 'url') return this.addNovelFromUrl();
    return this.addNovelFromPlugin(pick.pluginId);
  }

  async addNovelFromUrl() {
    const url = await vscode.window.showInputBox({
      prompt: 'Novel reference URL',
      placeHolder: 'https://...',
      ignoreFocusOut: true,
    });
    if (!url) return;
    const title = await vscode.window.showInputBox({
      prompt: 'Title',
      ignoreFocusOut: true,
    });
    if (!title) return;
    const novel: Novel = { id: cryptoId(), url, title, chapters: [] };
    await this.saveNovels([...this.novels, novel]);
  }

  async addNovelFromPlugin(pluginId: string) {
    const plugin = getPlugin(pluginId);
    if (!plugin) {
      vscode.window.showErrorMessage(`Unknown plugin: ${pluginId}`);
      return;
    }
    const term = await vscode.window.showInputBox({
      prompt: `Search ${plugin.name}`,
      placeHolder: 'Title or keywords…',
      ignoreFocusOut: true,
    });
    if (!term) return;

    const results = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Searching ${plugin.name}…` },
      () => plugin.searchNovels(term, 1),
    );

    if (results.length === 0) {
      vscode.window.showInformationMessage('No results.');
      return;
    }

    const pick = await vscode.window.showQuickPick(
      results.map((r) => ({
        label: r.name,
        description: r.path,
        item: r,
      })),
      { placeHolder: `Pick a novel (${results.length} results)`, matchOnDescription: true },
    );
    if (!pick) return;

    const sourceNovel = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading "${pick.item.name}" from ${plugin.name}…`,
      },
      () => plugin.parseNovel(pick.item.path),
    );

    const novelId = cryptoId();
    const chapters = (sourceNovel.chapters ?? []).map<Chapter>((c) => ({
      novelId,
      title: c.name,
      path: c.path,
      pluginId: plugin.id,
      url: plugin.site + c.path,
    }));

    const novel: Novel = {
      id: novelId,
      pluginId: plugin.id,
      path: sourceNovel.path,
      title: sourceNovel.name ?? pick.item.name,
      url: plugin.site + sourceNovel.path,
      cover: sourceNovel.cover,
      author: sourceNovel.author,
      summary: sourceNovel.summary,
      chapters,
    };

    await this.saveNovels([...this.novels, novel]);
    vscode.window.showInformationMessage(
      `Added "${novel.title}" with ${chapters.length} chapters.`,
    );
  }

  async addChapter(node: NovelNode | undefined) {
    const novel = node?.novel ?? (await this.pickNovel());
    if (!novel) return;
    const url = await vscode.window.showInputBox({
      prompt: 'Chapter URL',
      placeHolder: 'https://...',
      ignoreFocusOut: true,
    });
    if (!url) return;
    const title = await vscode.window.showInputBox({
      prompt: 'Chapter title',
      value: `Chapter ${novel.chapters.length + 1}`,
      ignoreFocusOut: true,
    });
    if (!title) return;
    const chapters = [...novel.chapters, { url, title, novelId: novel.id }];
    await this.saveNovels(
      this.novels.map((n) => (n.id === novel.id ? { ...n, chapters } : n)),
    );
  }

  async removeNovel(node: NovelNode | undefined) {
    const novel = node?.novel ?? (await this.pickNovel());
    if (!novel) return;
    const ok = await vscode.window.showWarningMessage(
      `Remove "${novel.title}" from your library?`,
      { modal: true },
      'Remove',
    );
    if (ok !== 'Remove') return;
    await this.saveNovels(this.novels.filter((n) => n.id !== novel.id));
  }

  async markRead(chapter: Chapter) {
    await this.saveNovels(
      this.novels.map((n) => {
        if (n.id !== chapter.novelId) return n;
        return {
          ...n,
          chapters: n.chapters.map((c) =>
            c.url === chapter.url ? { ...c, read: true } : c,
          ),
        };
      }),
    );
  }

  neighbors(chapter: Chapter): { prev?: Chapter; next?: Chapter } {
    const novel = this.novels.find((n) => n.id === chapter.novelId);
    if (!novel) return {};
    const idx = novel.chapters.findIndex((c) => c.url === chapter.url);
    if (idx < 0) return {};
    return { prev: novel.chapters[idx - 1], next: novel.chapters[idx + 1] };
  }

  private async pickNovel(): Promise<Novel | undefined> {
    const novels = this.novels;
    if (novels.length === 0) {
      vscode.window.showInformationMessage('No novels yet — add one first.');
      return;
    }
    const pick = await vscode.window.showQuickPick(
      novels.map((n) => ({ label: n.title, novel: n })),
      { placeHolder: 'Pick a novel' },
    );
    return pick?.novel;
  }
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
