import type { LockablePage } from "./page";
import type { CollectedRef, ResolvedRef } from "./ref-title";

import { monthly } from "./monthly";
import { getPeriodPageKey } from "./period";

export const REFS_HEADING_TITLE = "Refs";
// 画像 "![alt](url)" は "!" で始まるため除き、本文のリンクだけを拾う。
const MARKDOWN_LINK_PATTERN =
  /(?<![!\\])\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^)\s]+)\)/g;
// bookmark は <unknown url/>、embed は <embed src> で表現される。video 等のメディアは対象外。
const BLOCK_URL_PATTERN =
  /<unknown\b[^>]*\burl="(https?:\/\/[^"]*)"[^>]*\/>|<embed\b[^>]*\bsrc="(https?:\/\/[^"]*)"/g;
// コード例に含まれる URL は参照ではないため、収集前にコードブロックを取り除く。
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
const MARKDOWN_ESCAPE_PATTERN = /\\(.)/g;
const REFS_TITLE_SPECIAL_PATTERN = /[\\[\]*_`~|<>]/g;

interface PositionedRef extends CollectedRef {
  readonly index: number;
}

function isNotionInternalUrl(url: string): boolean {
  if (url.startsWith("/")) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === "notion.so" ||
      hostname.endsWith(".notion.so") ||
      hostname === "app.notion.com"
    );
  } catch {
    return false;
  }
}

// Notion がホストするファイルの署名付き URL は失効するため、参照として残さない。
function isSignedFileUrl(url: string): boolean {
  return url.includes("X-Amz-");
}

function isRefTarget(url: string): boolean {
  return !isNotionInternalUrl(url) && !isSignedFileUrl(url);
}

function createCollectedRef(url: string, anchorText: string): CollectedRef {
  const trimmed = anchorText.replace(MARKDOWN_ESCAPE_PATTERN, "$1").trim();
  const anchorTitle = trimmed !== "" && trimmed !== url ? trimmed : null;
  return { url, anchorTitle };
}

function collectLinkRefs(markdown: string): readonly PositionedRef[] {
  return [...markdown.matchAll(MARKDOWN_LINK_PATTERN)].flatMap<PositionedRef>(
    function (match) {
      const [, anchorText = "", url = ""] = match;

      return isRefTarget(url)
        ? [{ ...createCollectedRef(url, anchorText), index: match.index }]
        : [];
    },
  );
}

function collectBlockUrlRefs(markdown: string): readonly PositionedRef[] {
  return [...markdown.matchAll(BLOCK_URL_PATTERN)].flatMap<PositionedRef>(
    function (match) {
      const url = match[1] ?? match[2] ?? "";

      return isRefTarget(url)
        ? [{ url, anchorTitle: null, index: match.index }]
        : [];
    },
  );
}

// URL ごとに初出だけを残し、アンカーテキストは初出の非 URL テキストを採用する。
function mergeRef(
  refs: readonly CollectedRef[],
  ref: CollectedRef,
): readonly CollectedRef[] {
  const existingIndex = refs.findIndex(function (candidate) {
    return candidate.url === ref.url;
  });

  if (existingIndex === -1) {
    return [...refs, ref];
  }

  const existing = refs[existingIndex];

  if (existing?.anchorTitle !== null || ref.anchorTitle === null) {
    return refs;
  }

  return refs.with(existingIndex, ref);
}

export function collectRefs(markdown: string): readonly CollectedRef[] {
  const prose = markdown.replace(FENCED_CODE_PATTERN, "");

  return [...collectLinkRefs(prose), ...collectBlockUrlRefs(prose)]
    .toSorted(function (left, right) {
      return left.index - right.index;
    })
    .map(function ({ url, anchorTitle }) {
      return { url, anchorTitle };
    })
    .reduce(mergeRef, []);
}

function escapeRefTitle(title: string): string {
  return title.replace(REFS_TITLE_SPECIAL_PATTERN, "\\$&");
}

export function buildRefsSection(refs: readonly ResolvedRef[]): string {
  if (refs.length === 0) {
    return "";
  }

  const bullets = refs.map(function (ref) {
    return `- [${escapeRefTitle(ref.title)}](${ref.url})`;
  });

  return `---\n## ${REFS_HEADING_TITLE}\n${bullets.join("\n")}\n`;
}

// Refs は月が閉じる直前に一度だけ作る。ロック済みで Refs の無い過去月は、閉じ忘れとして補完する。
export function shouldGenerateRefs(
  page: LockablePage,
  headingTitles: readonly string[],
  now: Date,
  canLock: boolean,
): boolean {
  if (page.periodType !== "monthly" || headingTitles.includes(REFS_HEADING_TITLE)) {
    return false;
  }

  const isPastMonth =
    monthly.compare(getPeriodPageKey(monthly, page), monthly.keyOfDate(now)) === -1;

  return isPastMonth && (page.isLocked || canLock);
}
