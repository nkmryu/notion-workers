// Notion の URL に関する規則。内部リンクの判定と、ページ・ブロックへの URL の組み立てをここに閉じる。
const NOTION_PAGE_URL_BASE = "https://app.notion.com/p/";
const NOTION_HOSTNAMES = ["notion.so", "app.notion.com"];

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
