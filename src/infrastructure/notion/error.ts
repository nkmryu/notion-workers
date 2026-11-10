import { APIErrorCode, APIResponseError, isHTTPResponseError } from "@notionhq/client";

const BAD_REQUEST_STATUS = 400;
const PAYLOAD_TOO_LARGE_STATUS = 413;

// 本文を理由に追記を拒否されたか。書式検証エラーと、本文が大きすぎるときの 413 だけは転記フォールバックで継続できる。
// 413 は Notion が JSON のエラー本文を返さないため、SDK は UnknownHTTPResponseError として投げる（2026-11-10 に確認）。
// 認証・レート制限・通信障害は継続しない。
export function isNotionContentRejection(error: unknown): boolean {
  if (!isHTTPResponseError(error)) {
    return false;
  }

  if (error.status === PAYLOAD_TOO_LARGE_STATUS) {
    return true;
  }

  return (
    APIResponseError.isAPIResponseError(error) &&
    error.status === BAD_REQUEST_STATUS &&
    error.code === APIErrorCode.ValidationError
  );
}
