import * as vscode from 'vscode';
import { LibraryProvider } from './library';
import { openReader, openUrlReader } from './reader';
import { setRuntimeContext } from './plugins';

export function activate(context: vscode.ExtensionContext) {
  setRuntimeContext(context);
  const library = new LibraryProvider(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('vscroll.library', library),
    vscode.commands.registerCommand('vscroll.addNovel', () => library.addNovel()),
    vscode.commands.registerCommand('vscroll.addChapter', (item) => library.addChapter(item)),
    vscode.commands.registerCommand('vscroll.removeNovel', (item) => library.removeNovel(item)),
    vscode.commands.registerCommand('vscroll.refresh', () => library.refresh()),
    vscode.commands.registerCommand('vscroll.openChapter', (chapter) =>
      openReader(context, library, chapter),
    ),
    vscode.commands.registerCommand('vscroll.openUrl', () => openUrlReader(context)),
  );
}

export function deactivate() {}
