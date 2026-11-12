import { ConflictException, ForbiddenException, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";

function capture(exception: unknown, status: number, request: Record<string, unknown> = { correlationId: "corr-1" }) {
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
      getRequest: () => request,
    }),
  };

  new HttpExceptionFilter().catch(exception, host as never);
  expect(body.status).toBe(status);
  return body.payload as {
    error: { code: string; message: string; messageAr: string; details?: unknown };
    correlationId: string | null;
  };
}

afterEach(() => vi.restoreAllMocks());

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

  it("keeps a generic message when a 401 body carries no message of its own", () => {
    const payload = capture(new HttpException({}, HttpStatus.UNAUTHORIZED), 401);
    expect(payload.error).toMatchObject({ code: "UNAUTHORIZED", message: "Authentication required" });
  });

  it("keeps a generic message when a 404 body carries no message of its own", () => {
    const payload = capture(new HttpException({}, HttpStatus.NOT_FOUND), 404);
    expect(payload.error).toMatchObject({ code: "NOT_FOUND", message: "Resource not found" });
  });

  it("honours an explicit error code carried by the exception payload", () => {
    const payload = capture(new HttpException({ message: "Custom failure", code: "EDAS_CUSTOM" }, HttpStatus.CONFLICT), 409);
    expect(payload.error).toMatchObject({ code: "EDAS_CUSTOM", message: "Custom failure" });
  });

  it("ignores an exception payload without a message", () => {
    const payload = capture(new HttpException(undefined as never, HttpStatus.BAD_REQUEST), 400);
    expect(payload.error).toMatchObject({ code: "BAD_REQUEST", message: "Internal server error" });
  });

  it("names an unmapped client status after its HTTP number", () => {
    const payload = capture(new HttpException("teapot", 418), 418);
    expect(payload.error.code).toBe("HTTP_418");
  });

  it("turns an unexpected Error into a 500 without leaking its message", () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    const payload = capture(new Error("database password rejected"), 500);

    expect(payload.error).toMatchObject({ code: "INTERNAL_ERROR", message: "Internal server error" });
    expect(Logger.prototype.error).toHaveBeenCalledWith("database password rejected", expect.any(String));
  });

  it("stringifies a thrown value that is not an Error", () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    const payload = capture("boom", 500);

    expect(payload.error.code).toBe("INTERNAL_ERROR");
    expect(Logger.prototype.error).toHaveBeenCalledWith("boom", undefined);
  });

  it("logs the request target for a client error and omits it when the request has none", () => {
    const debug = vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);

    capture(new ConflictException("Document changed"), 409, { method: "PATCH", path: "/api/v1/documents/1", correlationId: "c-1" });
    capture(new ConflictException("Document changed"), 409, {});

    expect(debug).toHaveBeenNthCalledWith(1, "409 CONFLICT Document changed PATCH /api/v1/documents/1");
    expect(debug).toHaveBeenNthCalledWith(2, "409 CONFLICT Document changed");
  });

  it("returns a null correlation id when the request never carried one", () => {
    const payload = capture(new ConflictException("Document changed"), 409, {});

    expect(payload.correlationId).toBeNull();
  });
});
