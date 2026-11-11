import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { arabicReason, hasArabicReason } from "./error-reasons-ar";

const SRC_ROOT = join(__dirname, "..", "..");
const EXCEPTION_CONSTRUCTOR =
  /(ForbiddenException|ConflictException|NotFoundException|BadRequestException|UnprocessableEntityException|PreconditionFailedException|GoneException|UnauthorizedException)\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!full.endsWith(".ts") || full.includes(".test.ts")) return [];
    return [full];
  });
}

function firstArgument(text: string, openParen: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openParen; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(openParen + 1, index);
    }
  }
  return text.slice(openParen + 1, openParen + 400);
}

function messageLiterals(argument: string): string[] {
  const found: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(argument))) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\`/g, "`");
    const collapsed = raw
      .replace(/\$\{[^}]*\}/g, "X")
      .replace(/\s+/g, " ")
      .trim();
    if (collapsed && collapsed !== "X") found.push(collapsed);
  }
  return found;
}

function thrownMessages(): Array<{ file: string; message: string }> {
  return sourceFiles(SRC_ROOT).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    const collected: Array<{ file: string; message: string }> = [];
    let match: RegExpExecArray | null;
    EXCEPTION_CONSTRUCTOR.lastIndex = 0;
    while ((match = EXCEPTION_CONSTRUCTOR.exec(text))) {
      for (const message of messageLiterals(firstArgument(text, match.index + match[0].length - 1))) {
        collected.push({ file, message });
      }
    }
    return collected;
  });
}

describe("server error reasons catalogue", () => {
  it("reads the guard messages straight out of the API sources", () => {
    expect(new Set(thrownMessages().map((entry) => entry.message)).size).toBeGreaterThan(80);
  });

  it("has an Arabic reason for every message the API throws", () => {
    const missing = thrownMessages()
      .filter((entry) => !hasArabicReason(entry.message))
      .map((entry) => `${relative(SRC_ROOT, entry.file)}: ${entry.message}`);
    expect(missing).toEqual([]);
  });

  it("answers in Arabic and never echoes the English text", () => {
    expect(arabicReason("Document is checked out by another user", 409)).toBe("الوثيقة مُستخرجة من مستخدم آخر");
    expect(arabicReason("Missing permission: document.delete", 403)).toBe("الصلاحية غير متوفرة: document.delete");
    expect(arabicReason("Approval is already APPROVED", 409)).toBe("طلب الموافقة مقبول ولا يمكن تسجيل قرار عليه");
    expect(arabicReason("Section Technical Affairs is outside the departments you manage", 403)).toBe(
      "Section Technical Affairs خارج الإدارات التي تديرها",
    );
    expect(arabicReason("Some message nobody catalogued", 409)).toBe("تعارض مع الحالة الحالية للسجل");
    expect(arabicReason("Some message nobody catalogued", 429)).toBe("عدد كبير من الطلبات، حاول بعد قليل");
    expect(arabicReason(undefined, 403)).toBe("صلاحيات غير كافية");
    for (const message of ["Document not found", "Insufficient permissions", "Validation failed", "User not found"]) {
      const reason = arabicReason(message, 400);
      expect(reason).not.toBe(message);
      expect(/[\u0600-\u06FF]/.test(reason)).toBe(true);
    }
  });
});
