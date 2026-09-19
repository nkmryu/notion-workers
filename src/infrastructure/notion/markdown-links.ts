// Markdown API は、プレビュー展開済みの bookmark / link_preview を外部 URL ではなく
// 自ブロックへのリンク "<unknown url=\"https://app.notion.com/p/<page>#<block>\"/>" で出力する。
// ブロック API で引き直した外部 URL に置き換え、ドメインには外部 URL 入りの本文だけを渡す。
const NOTION_BLOCK_LINK_PATTERN =
  /<unknown\b[^>]*\burl="https:\/\/app\.notion\.com\/p\/[0-9a-f]{32}#([0-9a-f]{32})"[^>]*\/>/g;

export function extractBlockLinkIds(markdown: string): readonly string[] {
  return [
    ...new Set(
      [...markdown.matchAll(NOTION_BLOCK_LINK_PATTERN)].flatMap<string>(function (match) {
        return match[1] === undefined ? [] : [match[1]];
      }),
    ),
  ];
}

export function restoreBlockLinks(
  markdown: string,
  blockUrls: ReadonlyMap<string, string>,
): string {
  return markdown.replace(NOTION_BLOCK_LINK_PATTERN, function (match, blockId: string) {
    const url = blockUrls.get(blockId);

    return url === undefined ? match : `[${url}](${url})`;
  });
}
