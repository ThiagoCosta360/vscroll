import { CheerioAPI, load } from 'cheerio';
import { fetchApi, storage } from './runtime';
import { ChapterItem, NovelItem, SourceNovel, VScrollPlugin } from './types';

class NovelFire implements VScrollPlugin {
  id = 'novelfire';
  name = 'Novel Fire';
  site = 'https://novelfire.net/';

  private draw = 0;

  private async getCheerio(url: string, search: boolean): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok && !search) {
      throw new Error(`Could not reach site (${r.status}). Try opening it in a browser.`);
    }
    const $ = load(await r.text());
    if ($('title').text().includes('Cloudflare')) {
      throw new Error('Cloudflare is blocking requests. Try again later.');
    }
    return $;
  }

  private parseNovels($: CheerioAPI, selector = '.novel-item'): NovelItem[] {
    const seen = new Set<string>();
    return $(selector)
      .map((_, el): NovelItem | null => {
        const $el = $(el);
        const titleEl = $el.find('.novel-title > a');
        const fallback = $el.find('a');
        const name = titleEl.text() || fallback.attr('title') || 'No Title';
        const img = $el.find('.novel-cover > img');
        const rawSrc = img.attr('data-src') ?? img.attr('src');
        const cover = rawSrc ? new URL(rawSrc, this.site).href : undefined;
        const href = titleEl.attr('href') || fallback.attr('href');
        if (!href) return null;
        const path = new URL(href, this.site).pathname.substring(1);
        if (seen.has(path)) return null;
        seen.add(path);
        return { name, cover, path };
      })
      .get()
      .filter((n: NovelItem | null): n is NovelItem => n !== null);
  }

  async searchNovels(term: string, page = 1): Promise<NovelItem[]> {
    if (page === 1) this.draw = 0;
    const params = new URLSearchParams();
    params.append('keyword', term);
    params.append('page', String(page));
    const url = `${this.site}search?${params}`;
    const r = await fetchApi(url);
    const $ = load(await r.text());
    return this.parseNovels($, '.novel-list.chapters .novel-item');
  }

  async parseNovel(novelPath: string): Promise<SourceNovel> {
    this.draw = 0;
    const $ = await this.getCheerio(this.site + novelPath, false);

    const post_id = $('#novel-report').attr('report-post_id');
    if (post_id) {
      storage.set(`${this.id}_${novelPath.split('/').pop()}`, post_id);
    }

    const novel: SourceNovel = { path: novelPath };

    novel.name =
      $('.novel-title').text().trim() || $('.cover > img').attr('alt') || 'No Title';

    const coverUrl = $('.cover > img').attr('data-src') ?? $('.cover > img').attr('src');
    if (coverUrl) novel.cover = new URL(coverUrl, this.site).href;

    novel.genres = $('.categories .property-item')
      .map((_, el) => $(el).text())
      .toArray()
      .join(', ');

    const summary = $('.summary .content');
    summary.find('.expand').remove();
    summary.find('br').replaceWith('\n');
    summary.find('p').before('\n').after('\n\n');
    novel.summary =
      summary
        .text()
        .split('\n')
        .map((l) => l.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() || undefined;

    novel.author = $('.author .property-item > span').text() || undefined;

    const rawStatus =
      $('.header-stats .ongoing').text() || $('.header-stats .completed').text() || 'Unknown';
    novel.status = rawStatus.trim() || 'Unknown';

    if (post_id) {
      novel.chapters = await this.getAllChapters(novelPath, post_id);
    }
    return novel;
  }

  private async getAllChapters(novelPath: string, post_id: string): Promise<ChapterItem[]> {
    this.draw++;
    const params = new URLSearchParams({
      draw: String(this.draw),
      'columns[0][data]': 'n_sort',
      'columns[0][name]': 'cmm_posts_detail.n_sort',
      'columns[0][searchable]': 'true',
      'columns[0][orderable]': 'true',
      'columns[0][search][value]': '',
      'columns[0][search][regex]': 'false',
      'columns[1][data]': 'bookmark_created_at',
      'columns[1][name]': 'bookmark_chapters.created_at',
      'columns[1][searchable]': 'false',
      'columns[1][orderable]': 'true',
      'columns[1][search][value]': '',
      'columns[1][search][regex]': 'false',
      'order[0][column]': '0',
      'order[0][dir]': 'asc',
      'order[0][name]': 'cmm_posts_detail.n_sort',
      start: '0',
      length: '-1',
      'search[value]': '',
      'search[regex]': 'false',
      post_id,
      only_bookmark: 'false',
      _: String(Date.now()),
    });

    const result = await fetchApi(`${this.site}ajax/listChapterDataAjax?${params}`);
    if (result.status === 429) throw new Error('Novel Fire is rate limiting requests.');
    const body = await result.text();
    if (body.includes('You are being rate limited')) {
      throw new Error('Novel Fire is rate limiting requests.');
    }
    if (body.includes('Page Not Found 404')) {
      throw new Error('Novel Fire ajax interface not found.');
    }

    const data: Array<{ title?: string; slug: string; n_sort: string | number }> =
      JSON.parse(body).data ?? [];

    return data
      .flatMap((idx) => {
        const name = load(idx.title || idx.slug)
          .text()
          .replace(/[​-‍﻿]/g, '')
          .trim();
        const num = Number(idx.n_sort);
        return name && !isNaN(num)
          ? [{ name, path: `${novelPath}/chapter-${num}`, chapterNumber: num }]
          : [];
      })
      .sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath, false);
    const content = $('#content');
    const odds = content.find(':not(p, h1, span, i, b, u, img, a, div, strong)');
    for (const ele of odds.toArray()) {
      const tag = (ele as { name?: string }).name?.toString() ?? '';
      if (tag.length > 5 && tag.startsWith('nf')) {
        $(ele).remove();
      }
    }
    return content.html()?.replace(/&nbsp;/g, ' ') ?? '';
  }
}

export default new NovelFire();
