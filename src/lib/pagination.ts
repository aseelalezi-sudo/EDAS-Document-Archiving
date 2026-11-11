import type { Paginated } from "@edas/shared";

export const PAGE_SIZE = 100;
export const MAX_PAGES = 20;

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface LoadedPages<T> {
  items: T[];
  total: number;
  truncated: boolean;
}

export async function loadAllPages<T>(
  fetchPage: (query: PageQuery) => Promise<Paginated<T>>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<LoadedPages<T>> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const items: T[] = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage({ page, pageSize });
    total = result.meta.total;
    items.push(...result.items);
    if (items.length >= total || result.items.length === 0) break;
  }
  return { items, total, truncated: items.length < total };
}
