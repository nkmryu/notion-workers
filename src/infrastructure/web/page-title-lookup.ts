import type { PageTitleSource } from "../../application/page-title-source";

import { extractHtmlTitle, isHtmlContentType } from "./page-title";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 64 * 1024;
const USER_AGENT = "notion-workers/1.0";

// 先頭 MAX_HTML_BYTES までを読む。title は文書の先頭にあるので全文は要らない。
async function readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: readonly Uint8Array[],
  byteLength: number,
): Promise<readonly Uint8Array[]> {
  const { done, value } = await reader.read();

  if (done || value === undefined) {
    return chunks;
  }

  const chunk = value.subarray(0, MAX_HTML_BYTES - byteLength);
  const nextChunks = [...chunks, chunk];
  const nextLength = byteLength + chunk.byteLength;

  if (nextLength >= MAX_HTML_BYTES) {
    await reader.cancel();
    return nextChunks;
  }

  return readChunks(reader, nextChunks, nextLength);
}

async function readResponsePrefix(response: Response): Promise<string | null> {
  if (response.body === null) {
    return null;
  }

  const reader = response.body.getReader();

  try {
    return new TextDecoder().decode(Buffer.concat(await readChunks(reader, [], 0)));
  } finally {
    reader.releaseLock();
  }
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
