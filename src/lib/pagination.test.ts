import { describe, expect, it, vi } from "vitest";
import { loadAllPages, MAX_PAGES, PAGE_SIZE } from "./pagination";

function page<T>(items: T[], total: number) {
  return { items, meta: { page: 1, pageSize: PAGE_SIZE, total } };
}

describe("loadAllPages", () => {
  it("keeps requesting pages until it reaches the reported total", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 3))
      .mockResolvedValueOnce(page([3], 3));

    const result = await loadAllPages(fetchPage, { pageSize: 2 });

    expect(result).toEqual({ items: [1, 2, 3], total: 3, truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 2 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 2 });
  });

  it("stops on an empty page even when the total claims more", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1], 5))
      .mockResolvedValueOnce(page([], 5));

    const result = await loadAllPages(fetchPage, { pageSize: 10 });

    expect(result).toEqual({ items: [1], total: 5, truncated: true });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops at the page cap and flags the truncation", async () => {
    const fetchPage = vi.fn(async ({ page: index }: { page: number }) => page([index], 1000));

    const result = await loadAllPages(fetchPage, { pageSize: 1, maxPages: 3 });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ items: [1, 2, 3], total: 1000, truncated: true });
  });

  it("falls back to the shared page size and cap", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page([], 0));

    await loadAllPages(fetchPage);

    expect(PAGE_SIZE).toBe(100);
    expect(MAX_PAGES).toBe(20);
    expect(fetchPage).toHaveBeenCalledWith({ page: 1, pageSize: PAGE_SIZE });
  });
});
