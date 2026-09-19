import type { Client } from "@notionhq/client";

import { getBlockUrl } from "./notion-client";
import {
  extractNotionBlockLinkIds,
  replaceNotionBlockLinks,
} from "./transfer-markdown";

const READ_INTERVAL_MS = 150;

function sleep(milliseconds: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

// Markdown が自ブロックへのリンクに畳んだ bookmark 等の外部 URL を、ブロック API で引き直して本文へ戻す。
export async function restoreExternalLinks(
  notion: Client,
  markdown: string,
): Promise<string> {
  const blockIds = extractNotionBlockLinkIds(markdown);
  let blockUrls: ReadonlyMap<string, string> = new Map();

  for (const blockId of blockIds) {
    const url = await getBlockUrl(notion, blockId);
    await sleep(READ_INTERVAL_MS);

    if (url !== null) {
      blockUrls = new Map([...blockUrls, [blockId, url]]);
    }
  }

  return replaceNotionBlockLinks(markdown, blockUrls);
}
