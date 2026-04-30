// Compatibility shims so plugins copied verbatim from lnreader-plugins
// (with their imports rewritten to this file) can run inside vscroll.
//
// Types are intentionally loose (`any`) for installed third-party code —
// the goal is "it runs" not "it type-checks against vscroll's stricter API."

export { fetchApi, storage } from './runtime';

export const NovelStatus = {
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  OnHiatus: 'On Hiatus',
  Cancelled: 'Cancelled',
  Unknown: 'Unknown',
  Licensed: 'Licensed',
  PublishingFinished: 'Publishing Finished',
} as const;

export const FilterTypes = {
  Picker: 'Picker',
  CheckboxGroup: 'CheckboxGroup',
  Switch: 'Switch',
  TextInput: 'TextInput',
  ExcludableCheckboxGroup: 'ExcludableCheckboxGroup',
} as const;

export const defaultCover =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/600px-No_image_available.svg.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Filters = any;

export function isUrlAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function parseDate(input: string | number | Date | undefined): Date | undefined {
  if (input == null) return undefined;
  const d = new Date(input);
  return isNaN(d.getTime()) ? undefined : d;
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-namespace */
export namespace Plugin {
  export type PluginBase = any;
  export type NovelItem = any;
  export type ChapterItem = any;
  export type SourceNovel = any;
  export type SourcePage = any;
  export type PopularNovelsOptions<F = any> = any;
}
