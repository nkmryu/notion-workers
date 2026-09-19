import { APIErrorCode, APIResponseError } from "@notionhq/client";

const BAD_REQUEST_STATUS = 400;

// 書式検証エラーだけは転記フォールバックで継続できる。認証・レート制限・通信障害は継続しない。
export function isNotionValidationError(error: unknown): boolean {
  return (
    APIResponseError.isAPIResponseError(error) &&
    error.status === BAD_REQUEST_STATUS &&
    error.code === APIErrorCode.ValidationError
  );
}
