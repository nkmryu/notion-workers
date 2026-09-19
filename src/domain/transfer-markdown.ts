import { createSectionHeader } from "./markdown-section";
import { createNotionPageUrl, isSignedFileUrl } from "./notion-url";

// toggle 等の子として置かれた行は先頭にタブが付くため、インデントを保ったまま置換する。
// Notion がホストするファイルは署名付き URL で返り、短時間で失効するため転記先へは持ち込めない。
// File Upload API（external_url）で取り込み直す案は、対象が全 Daily で月 0.4 枚、うち半数が toggle 内で
// 位置を再現できず、Markdown 転記へブロック追記と非同期待ちを持ち込むため 2026-09-19 に見送った。
// 行全体が 1 つのリンク・画像・メディアタグである行を捉え、URL を取り出す。
const FILE_LINE_PATTERN =
  /^([ \t]*)(?:!?\[[^\]]*\]\(([^)\s]*)\)|<[a-z-]+\b[^>]*\b(?:src|url)="([^"]*)"[^>]*>(?:<\/[a-z-]+>)?)$/gm;
// bookmark・link_preview など Markdown 化できないブロックは <unknown/> になり、そのまま書き戻せない。
const UNKNOWN_BLOCK_PATTERN = /^([ \t]*)<unknown\b([^>]*)\/>$/gm;
const URL_ATTRIBUTE_PATTERN = /\burl="([^"]*)"/;
const FALLBACK_MESSAGE =
  "（この日の転記はブロック互換性の問題で省略。元ページを参照）";

export interface DailyMarkdown {
  readonly pageId: string;
  readonly markdown: string;
}

function createPageMention(pageId: string): string {
  return `<mention-page url="${createNotionPageUrl(pageId)}"/>`;
}

function sanitizeDailyMarkdown(daily: DailyMarkdown): string {
  const mention = createPageMention(daily.pageId);

  return daily.markdown
    .replace(
      FILE_LINE_PATTERN,
      function (match, indent: string, linkUrl?: string, tagUrl?: string) {
        return isSignedFileUrl(linkUrl ?? tagUrl ?? "")
          ? `${indent}（画像/ファイルは元ページを参照） ${mention}`
          : match;
      },
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

export function createTransferSection(
  title: string,
  dailies: readonly DailyMarkdown[],
): string {
  const bodies = dailies.map(function (daily) {
    return sanitizeDailyMarkdown(daily).replace(/\n+$/, "");
  });

  return `${createSectionHeader(title)}${bodies.join("\n")}\n`;
}

export function createTransferFallbackSection(
  title: string,
  dailyPageIds: readonly string[],
): string {
  const mentions = dailyPageIds.map(createPageMention).join(" ");

  return `${createSectionHeader(title)}${FALLBACK_MESSAGE} ${mentions}\n`;
}
