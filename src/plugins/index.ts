import novelfire from './novelfire';
import { installedPlugins } from './installed';
import { VScrollPlugin } from './types';

const builtins: VScrollPlugin[] = [novelfire];

export const plugins: VScrollPlugin[] = [...builtins, ...installedPlugins];

export function getPlugin(id: string): VScrollPlugin | undefined {
  return plugins.find((p) => p.id === id);
}

export function isBuiltin(id: string): boolean {
  return builtins.some((p) => p.id === id);
}

export { setRuntimeContext } from './runtime';
export type { NovelItem, ChapterItem, SourceNovel, VScrollPlugin } from './types';
