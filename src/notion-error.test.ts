import { APIErrorCode, APIResponseError } from "@notionhq/client";
import { describe, expect, it } from "vitest";

import { isNotionValidationError } from "./notion-error";

function createApiError(status: number, code: APIErrorCode): APIResponseError {
  return new APIResponseError({
    code,
    status,
    message: "error",
    headers: new Headers(),
    rawBodyText: JSON.stringify({ code }),
    additional_data: undefined,
    request_id: undefined,
  });
}

describe("isNotionValidationError", () => {
  it("400 validation_error だけを転記フォールバック対象にする", () => {
    // ブロック互換性エラーだけを継続可能と判断することを保証する。
    expect(
      isNotionValidationError(
        createApiError(400, APIErrorCode.ValidationError),
      ),
    ).toBe(true);
    expect(
      isNotionValidationError(
        createApiError(401, APIErrorCode.ValidationError),
      ),
    ).toBe(false);
    expect(
      isNotionValidationError(createApiError(400, APIErrorCode.RateLimited)),
    ).toBe(false);
    expect(isNotionValidationError(new TypeError("network error"))).toBe(false);
  });
});
