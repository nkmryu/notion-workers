import { APIErrorCode, APIResponseError } from "@notionhq/client";

const BAD_REQUEST_STATUS = 400;

export function isNotionValidationError(error: unknown): boolean {
  return (
    APIResponseError.isAPIResponseError(error) &&
    error.status === BAD_REQUEST_STATUS &&
    error.code === APIErrorCode.ValidationError
  );
}
