// Notion Markdown API の方言を、ドメインがそのまま読める Markdown へ正規化する。
// ドメインが知るのは「セクション = divider + 見出し 2」「参照は [text](url) のリンク」「コピーできない箇所は元ページ参照」まで。
// <unknown/>・<embed>・<mention-page>・署名付き URL はこの層で吸収する。

const NOTION_PAGE_URL_BASE = "https://app.notion.com/p/";
// プレビュー展開済みの bookmark / link_preview は外部 URL ではなく自ブロックへのリンクで出力される。
const NOTION_BLOCK_LINK_PATTERN =
  /<unknown\b[^>]*\burl="https:\/\/app\.notion\.com\/p\/[0-9a-f]{32}#([0-9a-f]{32})"[^>]*\/>/g;
// Notion がホストするファイルは署名付き S3 URL（1 時間で失効）で返り、転記先へは持ち込めない。
// File Upload API（external_url）で取り込み直す案は、対象が全 Daily で月 0.4 枚、うち半数が toggle 内で
// 位置を再現できず、Markdown 転記へブロック追記と非同期待ちを持ち込むため 2026-09-19 に見送った。
// toggle 等の子として置かれた行は先頭にタブが付くため、インデントを保ったまま置換する。
const SIGNED_FILE_LINE_PATTERN =
  /^([ \t]*)(?:!?\[[^\]]*\]\([^)\s]*X-Amz-[^)\s]*\)|<[a-z-]+\b[^>]*X-Amz-[^>]*>(?:<\/[a-z-]+>)?)$/gm;
// 行の途中に置かれた署名付きリンクも失効するので、テキストだけ残す。
const SIGNED_FILE_INLINE_LINK_PATTERN = /!?\[([^\]]*)\]\([^)\s]*X-Amz-[^)\s]*\)/g;
// bookmark・link_preview など Markdown 化できないブロックは <unknown/> になり、そのまま書き戻せない。
const UNKNOWN_BLOCK_PATTERN = /^([ \t]*)<unknown\b([^>]*)\/>$/gm;
const URL_ATTRIBUTE_PATTERN = /\burl="([^"]*)"/;
// embed は <embed src="…"></embed>。参照先 URL を保つため、リンクへ正規化する。
const EMBED_PATTERN = /<embed\b[^>]*\bsrc="([^"]*)"[^>]*>(?:<\/embed>)?/g;

export function createPageMention(pageId: string): string {
  return `<mention-page url="${NOTION_PAGE_URL_BASE}${pageId.replaceAll("-", "")}"/>`;
}

export function extractBlockLinkIds(markdown: string): readonly string[] {
  return [
    ...new Set(
      [...markdown.matchAll(NOTION_BLOCK_LINK_PATTERN)].flatMap<string>(function (match) {
        return match[1] === undefined ? [] : [match[1]];
      }),
    ),
  ];
}

function restoreBlockLinks(markdown: string, blockUrls: ReadonlyMap<string, string>): string {
  return markdown.replace(NOTION_BLOCK_LINK_PATTERN, function (match, blockId: string) {
    const url = blockUrls.get(blockId);

    return url === undefined ? match : `[${url}](${url})`;
  });
}

export function normalizeMarkdown(
  markdown: string,
  pageId: string,
  blockUrls: ReadonlyMap<string, string>,
): string {
  const mention = createPageMention(pageId);

  return restoreBlockLinks(markdown, blockUrls)
    .replace(SIGNED_FILE_LINE_PATTERN, `$1（画像/ファイルは元ページを参照） ${mention}`)
    .replace(SIGNED_FILE_INLINE_LINK_PATTERN, "$1")
    .replace(UNKNOWN_BLOCK_PATTERN, function (_match, indent: string, attributes: string) {
      const url = URL_ATTRIBUTE_PATTERN.exec(attributes)?.[1] ?? "";

      return url === ""
        ? `${indent}（コピー非対応ブロック。元ページを参照） ${mention}`
        : `${indent}[${url}](${url})`;
    })
    .replace(EMBED_PATTERN, "[$1]($1)");
}
