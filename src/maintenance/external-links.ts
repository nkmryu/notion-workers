import type { NotionDiary } from "../notion/client";

import {
  extractNotionBlockLinkIds,
  restoreBlockLinks,
} from "../diary/transfer-markdown";
import { READ_INTERVAL_MS, sleep } from "../notion/pacing";

// Markdown が自ブロックへのリンクに畳んだ bookmark 等の外部 URL を、ブロック API で引き直して本文へ戻す。
export async function restoreExternalLinks(
  diary: NotionDiary,
  markdown: string,
): Promise<string> {
  let blockUrls: ReadonlyMap<string, string> = new Map();

  for (const blockId of extractNotionBlockLinkIds(markdown)) {
    const url = await diary.getBlockUrl(blockId);
    await sleep(READ_INTERVAL_MS);

    if (url !== null) {
      blockUrls = new Map([...blockUrls, [blockId, url]]);
    }
  }

  return restoreBlockLinks(markdown, blockUrls);
}
