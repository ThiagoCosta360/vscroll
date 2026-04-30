import * as vscode from 'vscode';
import { getPlugin, isBuiltin, plugins } from './plugins';
import { AvailablePlugin, listAvailablePlugins } from './plugins/registry';

type Node = SectionNode | InstalledNode | LanguageNode | AvailableNode | LoadingNode | ErrorNode;

class SectionNode {
  readonly kind = 'section' as const;
  constructor(
    public label: string,
    public sectionId: 'installed' | 'available',
  ) {}
}

class InstalledNode {
  readonly kind = 'installed' as const;
  constructor(public pluginId: string) {}
}

class LanguageNode {
  readonly kind = 'language' as const;
  constructor(public language: string, public count: number) {}
}

class AvailableNode {
  readonly kind = 'available' as const;
  constructor(public plugin: AvailablePlugin, public alreadyInstalled: boolean) {}
}

class LoadingNode {
  readonly kind = 'loading' as const;
}
class ErrorNode {
  readonly kind = 'error' as const;
  constructor(public message: string) {}
}

export class PluginsTreeProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChange = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private available: AvailablePlugin[] | undefined;
  private availableError: string | undefined;
  private loading = false;

  constructor(private context: vscode.ExtensionContext) {
    void this.loadAvailable();
  }

  refresh() {
    this._onDidChange.fire(undefined);
  }

  async refreshAvailable(force = true) {
    this.available = undefined;
    this.availableError = undefined;
    this._onDidChange.fire(undefined);
    await this.loadAvailable(force);
  }

  private async loadAvailable(force = false) {
    this.loading = true;
    try {
      this.available = await listAvailablePlugins(this.context, force);
      this.availableError = undefined;
    } catch (err) {
      this.availableError = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
      this._onDidChange.fire(undefined);
    }
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'section') {
      const item = new vscode.TreeItem(
        node.label,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = new vscode.ThemeIcon(
        node.sectionId === 'installed' ? 'extensions' : 'cloud-download',
      );
      item.contextValue = `section.${node.sectionId}`;
      item.id = `section:${node.sectionId}`;
      return item;
    }
    if (node.kind === 'installed') {
      const plugin = getPlugin(node.pluginId);
      const label = plugin?.name ?? node.pluginId;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('package');
      item.description = isBuiltin(node.pluginId) ? 'built-in' : 'installed';
      item.tooltip = plugin?.site ?? '';
      item.contextValue = isBuiltin(node.pluginId) ? 'plugin.builtin' : 'plugin.installed';
      item.command = {
        command: 'vscroll.browsePlugin',
        title: 'Browse',
        arguments: [node.pluginId],
      };
      return item;
    }
    if (node.kind === 'language') {
      const item = new vscode.TreeItem(
        node.language,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = new vscode.ThemeIcon('globe');
      item.description = `${node.count}`;
      item.id = `lang:${node.language}`;
      return item;
    }
    if (node.kind === 'available') {
      const item = new vscode.TreeItem(
        node.plugin.id,
        vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = new vscode.ThemeIcon(
        node.alreadyInstalled ? 'check' : 'cloud-download',
      );
      item.description = node.alreadyInstalled ? 'installed' : node.plugin.filename;
      item.tooltip = node.plugin.htmlUrl;
      item.contextValue = node.alreadyInstalled ? 'plugin.available.installed' : 'plugin.available';
      if (!node.alreadyInstalled) {
        item.command = {
          command: 'vscroll.installPlugin',
          title: 'Install',
          arguments: [node.plugin],
        };
      }
      return item;
    }
    if (node.kind === 'loading') {
      const item = new vscode.TreeItem('Loading available plugins…');
      item.iconPath = new vscode.ThemeIcon('loading~spin');
      return item;
    }
    const item = new vscode.TreeItem(`Failed: ${node.message}`);
    item.iconPath = new vscode.ThemeIcon('error');
    item.tooltip = node.message;
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return [
        new SectionNode(`Installed (${plugins.length})`, 'installed'),
        new SectionNode('Available', 'available'),
      ];
    }

    if (node.kind === 'section' && node.sectionId === 'installed') {
      return plugins.map((p) => new InstalledNode(p.id));
    }

    if (node.kind === 'section' && node.sectionId === 'available') {
      if (this.loading) return [new LoadingNode()];
      if (this.availableError) return [new ErrorNode(this.availableError)];
      if (!this.available) return [new LoadingNode()];

      const byLang = new Map<string, AvailablePlugin[]>();
      for (const a of this.available) {
        const arr = byLang.get(a.language) ?? [];
        arr.push(a);
        byLang.set(a.language, arr);
      }
      return [...byLang.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([lang, arr]) => new LanguageNode(lang, arr.length));
    }

    if (node.kind === 'language' && this.available) {
      const installedIds = new Set(plugins.map((p) => p.id));
      return this.available
        .filter((p) => p.language === node.language)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((p) => new AvailableNode(p, installedIds.has(p.id)));
    }

    return [];
  }
}
