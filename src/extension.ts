import * as vscode from 'vscode';
import { LibraryProvider } from './library';
import { openReader, openUrlReader } from './reader';
import { setRuntimeContext } from './plugins';
import { PluginsTreeProvider } from './pluginsTree';
import { installPlugin, uninstallPlugin } from './plugins/installer';
import { AvailablePlugin } from './plugins/registry';

export function activate(context: vscode.ExtensionContext) {
  setRuntimeContext(context);
  const library = new LibraryProvider(context);
  const pluginsTree = new PluginsTreeProvider(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('vscroll.library', library),
    vscode.window.registerTreeDataProvider('vscroll.plugins', pluginsTree),

    vscode.commands.registerCommand('vscroll.addNovel', () => library.addNovel()),
    vscode.commands.registerCommand('vscroll.addChapter', (item) => library.addChapter(item)),
    vscode.commands.registerCommand('vscroll.removeNovel', (item) => library.removeNovel(item)),
    vscode.commands.registerCommand('vscroll.refresh', () => library.refresh()),
    vscode.commands.registerCommand('vscroll.openChapter', (chapter) =>
      openReader(context, library, chapter),
    ),
    vscode.commands.registerCommand('vscroll.openUrl', () => openUrlReader(context)),

    vscode.commands.registerCommand('vscroll.refreshPlugins', () =>
      pluginsTree.refreshAvailable(true),
    ),
    vscode.commands.registerCommand('vscroll.browsePlugin', (pluginIdOrNode) => {
      const id = typeof pluginIdOrNode === 'string' ? pluginIdOrNode : pluginIdOrNode?.pluginId;
      if (id) return library.addNovelFromPlugin(id);
    }),
    vscode.commands.registerCommand(
      'vscroll.installPlugin',
      async (arg: AvailablePlugin | { plugin: AvailablePlugin }) => {
        const plugin = 'plugin' in arg ? arg.plugin : arg;
        if (!plugin) return;
        await runInstall(context, plugin, pluginsTree);
      },
    ),
    vscode.commands.registerCommand(
      'vscroll.uninstallPlugin',
      async (arg: { pluginId: string } | string) => {
        const id = typeof arg === 'string' ? arg : arg?.pluginId;
        if (!id) return;
        try {
          await uninstallPlugin({ extensionPath: context.extensionPath }, id);
          vscode.window.showInformationMessage(
            `Uninstalled "${id}". Reload the extension host to apply.`,
            'Reload Window',
          ).then((pick) => {
            if (pick === 'Reload Window') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
          pluginsTree.refresh();
        } catch (err) {
          vscode.window.showErrorMessage(
            `Uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    ),
  );
}

async function runInstall(
  context: vscode.ExtensionContext,
  available: AvailablePlugin,
  pluginsTree: PluginsTreeProvider,
) {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Installing plugin "${available.id}"…`,
      },
      async () => {
        await installPlugin({ extensionPath: context.extensionPath }, available);
      },
    );
    pluginsTree.refresh();
    const pick = await vscode.window.showInformationMessage(
      `Installed "${available.id}". Reload the extension host to activate it.`,
      'Reload Window',
    );
    if (pick === 'Reload Window') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Install failed: ${msg}`);
  }
}

export function deactivate() {}
