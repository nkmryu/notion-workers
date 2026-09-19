// Notion の URL に関する規則。内部リンクの判定と、ページ・ブロックへの URL の組み立てをここに閉じる。
const NOTION_PAGE_URL_BASE = "https://app.notion.com/p/";
const NOTION_HOSTNAMES = ["notion.so", "app.notion.com"];
// Markdown 中の "<unknown url=\"https://app.notion.com/p/<page>#<block>\"/>" からブロック ID を取り出す。
const NOTION_BLOCK_LINK_PATTERN =
  /<unknown\b[^>]*\burl="https:\/\/app\.notion\.com\/p\/[0-9a-f]{32}#([0-9a-f]{32})"[^>]*\/>/g;

export function createNotionPageUrl(pageId: string): string {
  return `${NOTION_PAGE_URL_BASE}${pageId.replaceAll("-", "")}`;
}

export function isNotionInternalUrl(url: string): boolean {
  if (url.startsWith("/")) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return NOTION_HOSTNAMES.some(function (candidate) {
      return hostname === candidate || hostname.endsWith(`.${candidate}`);
    });
  } catch {
    return false;
  }
}

// Notion がホストするファイルは署名付き S3 URL で返り、1 時間で失効する。
export function isSignedFileUrl(url: string): boolean {
  return url.includes("X-Amz-");
}

export function matchNotionBlockLinks(markdown: string): readonly RegExpExecArray[] {
  return [...markdown.matchAll(NOTION_BLOCK_LINK_PATTERN)];
}

export function replaceNotionBlockLinks(
  markdown: string,
  replace: (blockId: string, original: string) => string,
): string {
  return markdown.replace(NOTION_BLOCK_LINK_PATTERN, function (match, blockId: string) {
    return replace(blockId, match);
  });
}
