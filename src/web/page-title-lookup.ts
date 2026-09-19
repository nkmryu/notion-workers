import type { PageTitleSource } from "../maintenance/page-title-source";

import { extractHtmlTitle, isHtmlContentType } from "./page-title";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 64 * 1024;
const USER_AGENT = "notion-workers/1.0";

async function readResponsePrefix(response: Response): Promise<string | null> {
  if (response.body === null) {
    return null;
  }

  const reader = response.body.getReader();
  let chunks: readonly Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (byteLength < MAX_HTML_BYTES) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      const remaining = MAX_HTML_BYTES - byteLength;
      const chunk = result.value.subarray(0, remaining);
      chunks = [...chunks, chunk];
      byteLength += chunk.byteLength;

      if (byteLength >= MAX_HTML_BYTES) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

async function fetchRefTitle(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("Content-Type") ?? "";

    if (!isHtmlContentType(contentType)) {
      return null;
    }

    const html = await readResponsePrefix(response);
    return html === null ? null : extractHtmlTitle(html, contentType);
  } finally {
    clearTimeout(timeoutId);
  }
}

// 外部サイト固有の障害（タイムアウト・非 HTML・エラー応答）で月次処理全体を止めず、null へ収束させる。
export function createWebPageTitleSource(): PageTitleSource {
  return {
    async lookupTitle(url) {
      try {
        return await fetchRefTitle(url);
      } catch {
        return null;
      }
    },
  };
}
