export interface NovelItem {
  name: string;
  cover?: string;
  path: string;
}

export interface ChapterItem {
  name: string;
  path: string;
  chapterNumber?: number;
}

export interface SourceNovel {
  path: string;
  name?: string;
  cover?: string;
  summary?: string;
  author?: string;
  status?: string;
  genres?: string;
  chapters?: ChapterItem[];
}

export interface VScrollPlugin {
  id: string;
  name: string;
  site: string;
  searchNovels(term: string, page?: number): Promise<NovelItem[]>;
  parseNovel(path: string): Promise<SourceNovel>;
  parseChapter(path: string): Promise<string>;
}
