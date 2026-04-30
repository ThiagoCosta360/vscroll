import { NovelItem, SourceNovel, VScrollPlugin } from './types';

interface LnreaderLikePlugin {
  id: string;
  name: string;
  site: string;
  searchNovels?: (term: string, page: number) => Promise<NovelItem[]>;
  popularNovels?: (
    page: number,
    options: { showLatestNovels?: boolean; filters: Record<string, unknown> },
  ) => Promise<NovelItem[]>;
  parseNovel: (path: string) => Promise<SourceNovel>;
  parseChapter: (path: string) => Promise<string>;
  filters?: Record<string, { value: unknown }>;
}

export function adaptLnreaderPlugin(p: LnreaderLikePlugin): VScrollPlugin {
  return {
    id: p.id,
    name: p.name,
    site: p.site,
    async searchNovels(term: string, page = 1) {
      if (typeof p.searchNovels === 'function') {
        return p.searchNovels(term, page);
      }
      if (typeof p.popularNovels === 'function') {
        return runPopular(p, page);
      }
      throw new Error(`${p.name} does not support browse/search.`);
    },
    parseNovel: (path) => p.parseNovel(path),
    parseChapter: (path) => p.parseChapter(path),
  };
}

async function runPopular(p: LnreaderLikePlugin, page: number): Promise<NovelItem[]> {
  const filters = p.filters ? synthesizeDefaultFilters(p.filters) : {};
  return p.popularNovels!(page, { showLatestNovels: false, filters });
}

function synthesizeDefaultFilters(
  filterDef: Record<string, { value: unknown }>,
): Record<string, { value: unknown }> {
  const out: Record<string, { value: unknown }> = {};
  for (const [key, def] of Object.entries(filterDef)) {
    out[key] = { value: def.value };
  }
  return out;
}
