const HEADING_PATTERN = /^## (.+)$/gm;
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
// Notion がホストするファイルは署名付き URL で返り、短時間で失効するため転記先へは持ち込めない。
// File Upload API（external_url）で取り込み直す案は、対象が全 Daily で月 0.4 枚、うち半数が toggle 内で
// 位置を再現できず、Markdown 転記へブロック追記と非同期待ちを持ち込むため 2026-09-19 に見送った。
// toggle 等の子として置かれた行は先頭にタブが付くため、インデントを保ったまま置換する。
const SIGNED_FILE_LINK_PATTERN =
  /^([ \t]*)(?:!?\[[^\]]*\]\([^)\s]*X-Amz-[^)\s]*\)|<[a-z-]+\b[^>]*X-Amz-[^>]*>(?:<\/[a-z-]+>)?)$/gm;
// bookmark・link_preview など Markdown 化できないブロックは <unknown/> になり、そのまま書き戻せない。
const UNKNOWN_BLOCK_PATTERN = /^([ \t]*)<unknown\b([^>]*)\/>$/gm;
const URL_ATTRIBUTE_PATTERN = /\burl="([^"]*)"/;
// プレビュー展開済みの bookmark / link_preview は外部 URL ではなく自ブロックへのリンクで出力される。
const NOTION_BLOCK_LINK_PATTERN =
  /<unknown\b[^>]*\burl="https:\/\/app\.notion\.com\/p\/[0-9a-f]{32}#([0-9a-f]{32})"[^>]*\/>/g;
const FALLBACK_MESSAGE =
  "（この日の転記はブロック互換性の問題で省略。元ページを参照）";

export interface DailyMarkdown {
  readonly pageId: string;
  readonly markdown: string;
}

function createPageMention(pageId: string): string {
  return `<mention-page url="https://app.notion.com/p/${pageId.replaceAll("-", "")}"/>`;
}

export function extractHeadingTitles(markdown: string): readonly string[] {
  // コードブロック内の "## " 行を転記済み見出しと誤認しないよう、先に取り除く。
  const prose = markdown.replace(FENCED_CODE_PATTERN, "");

  return [...prose.matchAll(HEADING_PATTERN)].flatMap<string>(function (
    match,
  ) {
    const title = match[1]?.trim() ?? "";
    return title === "" ? [] : [title];
  });
}

export function extractNotionBlockLinkIds(markdown: string): readonly string[] {
  return [
    ...new Set(
      [...markdown.matchAll(NOTION_BLOCK_LINK_PATTERN)].flatMap<string>(
        function (match) {
          return match[1] === undefined ? [] : [match[1]];
        },
      ),
    ),
  ];
}

export function replaceNotionBlockLinks(
  markdown: string,
  blockUrls: ReadonlyMap<string, string>,
): string {
  return markdown.replace(NOTION_BLOCK_LINK_PATTERN, function (match, blockId: string) {
    const url = blockUrls.get(blockId);

    return url === undefined ? match : `[${url}](${url})`;
  });
}

function sanitizeDailyMarkdown(daily: DailyMarkdown): string {
  const mention = createPageMention(daily.pageId);

  return daily.markdown
    .replace(
      SIGNED_FILE_LINK_PATTERN,
      `$1（画像/ファイルは元ページを参照） ${mention}`,
    )
    .replace(
      UNKNOWN_BLOCK_PATTERN,
      function (_match, indent: string, attributes: string) {
        const url = URL_ATTRIBUTE_PATTERN.exec(attributes)?.[1] ?? "";

        // URL を持つブロックはリンクとして残し、Refs 収集の対象にも含める。
        return url === ""
          ? `${indent}（コピー非対応ブロック。元ページを参照） ${mention}`
          : `${indent}[${url}](${url})`;
      },
    );
}

function createHeader(title: string): string {
  return `---\n## ${title}\n`;
}

export function createTransferSection(
  title: string,
  dailies: readonly DailyMarkdown[],
): string {
  const bodies = dailies.map(function (daily) {
    return sanitizeDailyMarkdown(daily).replace(/\n+$/, "");
  });

  return `${createHeader(title)}${bodies.join("\n")}\n`;
}

export function createTransferFallbackSection(
  title: string,
  dailyPageIds: readonly string[],
): string {
  const mentions = dailyPageIds.map(createPageMention).join(" ");

  return `${createHeader(title)}${FALLBACK_MESSAGE} ${mentions}\n`;
}
