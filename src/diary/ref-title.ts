export interface CollectedRef {
  readonly url: string;
  readonly anchorTitle: string | null;
}

export interface ResolvedRef {
  readonly url: string;
  readonly title: string;
}

export type RefTitleSource = "anchor" | "http" | "fallback";

export interface SelectedRefTitle extends ResolvedRef {
  readonly source: RefTitleSource;
}

const MAX_TITLE_CHARACTERS = 200;
const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

export function isHtmlContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return HTML_CONTENT_TYPES.some(function (candidate) {
    return normalized.includes(candidate);
  });
}

function decodeEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  const namedEntities: Readonly<Record<string, string>> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&apos;": "'",
  };
  const named = namedEntities[normalized];

  if (named !== undefined) {
    return named;
  }

  const radix = normalized.startsWith("&#x") ? 16 : 10;
  const digits = normalized.slice(radix === 16 ? 3 : 2, -1);
  const codePoint = Number.parseInt(digits, radix);

  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return entity;
  }

  return String.fromCodePoint(codePoint);
}

function normalizeTitle(value: string): string | null {
  const decoded = value.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,
    decodeEntity,
  );
  const normalized = decoded.replace(/\s+/g, " ").trim();

  if (normalized === "") {
    return null;
  }

  return Array.from(normalized).slice(0, MAX_TITLE_CHARACTERS).join("");
}

function getAttribute(tag: string, name: string): string | null {
  const attributes = tag.matchAll(
    /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
  );

  for (const match of attributes) {
    if (match[1]?.toLowerCase() !== name.toLowerCase()) {
      continue;
    }

    return match[2] ?? match[3] ?? match[4] ?? null;
  }

  return null;
}

function extractOpenGraphTitle(html: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const property = getAttribute(tag, "property") ?? getAttribute(tag, "name");

    if (property?.toLowerCase() !== "og:title") {
      continue;
    }

    const content = getAttribute(tag, "content");
    const title = content === null ? null : normalizeTitle(content);

    if (title !== null) {
      return title;
    }
  }

  return null;
}

export function extractHtmlTitle(
  html: string,
  contentType: string,
): string | null {
  if (!isHtmlContentType(contentType)) {
    return null;
  }

  const openGraphTitle = extractOpenGraphTitle(html);

  if (openGraphTitle !== null) {
    return openGraphTitle;
  }

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return titleMatch?.[1] === undefined
    ? null
    : normalizeTitle(titleMatch[1]);
}

export function selectRefTitle(
  ref: CollectedRef,
  httpTitle: string | null,
): SelectedRefTitle {
  if (ref.anchorTitle !== null) {
    return { url: ref.url, title: ref.anchorTitle, source: "anchor" };
  }

  if (httpTitle !== null) {
    return { url: ref.url, title: httpTitle, source: "http" };
  }

  return { url: ref.url, title: ref.url, source: "fallback" };
}
