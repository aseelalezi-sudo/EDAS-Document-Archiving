import { ConflictException, ForbiddenException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";

function capture(exception: unknown, status: number) {
  const body = { status: 0, payload: undefined as unknown };
  const response = {
    status(code: number) {
      body.status = code;
      return this;
    },
    json(payload: unknown) {
      body.payload = payload;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ correlationId: "corr-1" }),
    }),
  };

  new HttpExceptionFilter().catch(exception, host as never);
  expect(body.status).toBe(status);
  return body.payload as { error: { code: string; message: string; messageAr: string; details?: unknown }; correlationId: string };
}

describe("HttpExceptionFilter Arabic reasons", () => {
  it("adds the Arabic reason next to the technical English message", () => {
    const payload = capture(new ForbiddenException("Out of department scope"), 403);
    expect(payload.error).toMatchObject({ code: "FORBIDDEN", message: "Out of department scope", messageAr: "خارج نطاق إدارتك" });
    expect(payload.correlationId).toBe("corr-1");
  });

  it("translates the conflict raised by a concurrent guard", () => {
    const payload = capture(new ConflictException("Document is checked out by another user"), 409);
    expect(payload.error.messageAr).toBe("الوثيقة مُستخرجة من مستخدم آخر");
  });

  it("keeps the audit chain readable when a Nest validation list is rejected", () => {
    const payload = capture(new HttpException({ message: ["fileId must be a UUID"], error: "Bad Request" }, HttpStatus.BAD_REQUEST), 400);
    expect(payload.error).toMatchObject({ code: "VALIDATION_ERROR", message: "Validation failed", messageAr: "تحقق من الحقول المطلوبة" });
    expect(payload.error.details).toEqual(["fileId must be a UUID"]);
  });

  it("still answers in Arabic for a message nobody catalogued", () => {
    const payload = capture(new ConflictException("Something nobody mapped yet"), 409);
    expect(payload.error.messageAr).toBe("تعارض مع الحالة الحالية للسجل");
  });

  it("maps the throttler rejection to 429 with an Arabic reason", () => {
    const payload = capture(new HttpException("ThrottlerException: Too Many Requests", HttpStatus.TOO_MANY_REQUESTS), 429);
    expect(payload.error).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      messageAr: "عدد كبير من الطلبات، حاول بعد قليل",
    });
  });
});
