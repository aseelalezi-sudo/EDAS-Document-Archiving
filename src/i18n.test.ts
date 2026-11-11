import { describe, expect, it } from "vitest";
import { translations } from "./i18n";

describe("i18n translations", () => {
  it("defines Arabic and English dictionaries", () => {
    expect(Object.keys(translations)).toEqual(expect.arrayContaining(["ar", "en"]));
  });

  it("keeps English and Arabic key sets in sync", () => {
    const ar = Object.keys(translations.ar).sort();
    const en = Object.keys(translations.en).sort();
    const missingInEn = ar.filter((k) => !(k in translations.en));
    const missingInAr = en.filter((k) => !(k in translations.ar));
    expect(missingInEn).toEqual([]);
    expect(missingInAr).toEqual([]);
  });

  it("has no empty translation values", () => {
    for (const lang of ["ar", "en"] as const) {
      const empties = Object.entries(translations[lang]).filter(([, v]) => v.trim() === "");
      expect(empties, `${lang} has empty values`).toEqual([]);
    }
  });
});
