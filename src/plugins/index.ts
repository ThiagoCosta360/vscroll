import novelfire from './novelfire';
import { VScrollPlugin } from './types';

export const plugins: VScrollPlugin[] = [novelfire];

export function getPlugin(id: string): VScrollPlugin | undefined {
  return plugins.find((p) => p.id === id);
}

export { setRuntimeContext } from './runtime';
export type { NovelItem, ChapterItem, SourceNovel, VScrollPlugin } from './types';
