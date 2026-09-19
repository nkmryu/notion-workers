import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "./daily";
import type { PeriodArchive } from "./period";

import { createSectionHeader, extractSectionTitles, stripFencedCode } from "./markdown-section";

export interface CollectedRef {
  readonly url: string;
  readonly anchorTitle: string | null;
}

export interface ResolvedRef {
  readonly url: string;
  readonly title: string;
}

// タイトルの出どころ。本文のアンカーテキストを最優先し、無ければリンク先ページのタイトル、それも無ければ URL 表示。
export const REF_TITLE_SOURCE = {
  anchor: "anchor",
  linked_page: "linked_page",
  url: "url",
} as const;
export type RefTitleSource = (typeof REF_TITLE_SOURCE)[keyof typeof REF_TITLE_SOURCE];

export interface SelectedRefTitle extends ResolvedRef {
  readonly source: RefTitleSource;
}

export const REFS_HEADING_TITLE = "Refs";
// 画像 "![alt](url)" は "!" で始まるため除き、本文のリンクだけを拾う。
const MARKDOWN_LINK_PATTERN =
  /(?<![!\\])\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^)\s]+)\)/g;
// 日誌の内部リンク（Notion 内のページ・ブロック）は参照ではない。
const INTERNAL_HOSTNAMES = ["notion.so", "app.notion.com"];
const MARKDOWN_ESCAPE_PATTERN = /\\(.)/g;
const REFS_TITLE_SPECIAL_PATTERN = /[\\[\]*_`~|<>]/g;

interface PositionedRef extends CollectedRef {
  readonly index: number;
}

function isInternalUrl(url: string): boolean {
  if (url.startsWith("/")) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return INTERNAL_HOSTNAMES.some(function (candidate) {
      return hostname === candidate || hostname.endsWith(`.${candidate}`);
    });
  } catch {
    return false;
  }
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

      return isInternalUrl(url)
        ? []
        : [{ ...createCollectedRef(url, anchorText), index: match.index }];
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
  // コード例に含まれる URL は参照ではないため、収集前にコードブロックを取り除く。
  const prose = stripFencedCode(markdown);

  return collectLinkRefs(prose)
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

  return `${createSectionHeader(REFS_HEADING_TITLE)}${bullets.join("\n")}\n`;
}

export function hasRefsSection(markdown: string): boolean {
  return extractSectionTitles(markdown).includes(REFS_HEADING_TITLE);
}

// Refs は月が閉じる直前に一度だけ作る。ロック済みで Refs の無い過去月は、閉じ忘れとして補完する。
export function shouldGenerateRefs(
  archive: PeriodArchive<Temporal.PlainYearMonth>,
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): boolean {
  if (archive.hasRefs || !archive.isPast(today)) {
    return false;
  }

  return archive.isLocked || archive.isFullyTransferred(dailies, today);
}

export function selectRefTitle(
  ref: CollectedRef,
  linkedPageTitle: string | null,
): SelectedRefTitle {
  if (ref.anchorTitle !== null) {
    return { url: ref.url, title: ref.anchorTitle, source: REF_TITLE_SOURCE.anchor };
  }

  if (linkedPageTitle !== null) {
    return { url: ref.url, title: linkedPageTitle, source: REF_TITLE_SOURCE.linked_page };
  }

  return { url: ref.url, title: ref.url, source: REF_TITLE_SOURCE.url };
}
