import { afterEach, describe, expect, it, vi } from "vitest";
import { openDownload } from "./download";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("openDownload", () => {
  it("opens the url in a new tab without leaking the referrer or the opener", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe("https://files.test/a.pdf");
      expect(this.target).toBe("_blank");
      expect(this.rel).toBe("noopener noreferrer");
      expect(document.body.contains(this)).toBe(true);
    });

    openDownload("https://files.test/a.pdf");

    expect(click).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector("a")).toBeNull();
  });
});
