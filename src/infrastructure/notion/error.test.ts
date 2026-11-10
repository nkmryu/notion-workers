import { APIErrorCode, APIResponseError, UnknownHTTPResponseError } from "@notionhq/client";
import { describe, expect, it } from "vitest";

import { isNotionContentRejection } from "./error";

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

function createUnknownHttpError(status: number): UnknownHTTPResponseError {
  return new UnknownHTTPResponseError({
    status,
    message: undefined,
    headers: new Headers(),
    rawBodyText: "",
  });
}

describe("isNotionContentRejection", () => {
  it("400 validation_error を転記フォールバック対象にする", () => {
    // ブロック互換性エラーを継続可能と判断することを保証する。
    expect(isNotionContentRejection(createApiError(400, APIErrorCode.ValidationError))).toBe(true);
    expect(isNotionContentRejection(createApiError(401, APIErrorCode.ValidationError))).toBe(false);
    expect(isNotionContentRejection(createApiError(400, APIErrorCode.RateLimited))).toBe(false);
  });

  it("本文が大きすぎる 413 を転記フォールバック対象にする", () => {
    // 1 日分の本文が 1 回の追記に収まらない日で実行全体を止めず、注記に切り替えて続けることを保証する。
    expect(isNotionContentRejection(createUnknownHttpError(413))).toBe(true);
  });

  it("それ以外の HTTP エラーと通信障害は継続しない", () => {
    // サーバー障害や通信障害を本文の問題と取り違えて、転記を省略しないことを保証する。
    expect(isNotionContentRejection(createUnknownHttpError(502))).toBe(false);
    expect(isNotionContentRejection(new TypeError("network error"))).toBe(false);
  });
});
