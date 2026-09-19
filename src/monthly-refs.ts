import type { PageState } from "./page-action";
import type { CollectedRef, ResolvedRef } from "./ref-title";

import {
  compareCalendarMonths,
  createMonthlyPageActionContext,
  getMonthlyPageMonth,
} from "./monthly-page";

export const REFS_HEADING_TITLE = "Refs";
// 画像 "![alt](url)" は "!" で始まるため除き、本文のリンクだけを拾う。
const MARKDOWN_LINK_PATTERN = /(?<![!\\])\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^)\s]+)\)/g;
// bookmark は <unknown url/>、embed は <embed src> で表現される。video 等のメディアは対象外。
const BLOCK_URL_PATTERN =
  /<unknown\b[^>]*\burl="(https?:\/\/[^"]*)"[^>]*\/>|<embed\b[^>]*\bsrc="(https?:\/\/[^"]*)"/g;
// コード例に含まれる URL は参照ではないため、収集前にコードブロックを取り除く。
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
const MARKDOWN_ESCAPE_PATTERN = /\\(.)/g;
const REFS_TITLE_SPECIAL_PATTERN = /[\\[\]*_`~|<>]/g;

export type MonthlyFinalizationStep =
  | { readonly type: "generate_refs"; readonly pageId: string }
  | { readonly type: "lock"; readonly pageId: string };

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

function unescapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_ESCAPE_PATTERN, "$1");
}

function createCollectedRef(url: string, anchorText: string): CollectedRef {
  const trimmed = unescapeMarkdown(anchorText).trim();
  const anchorTitle = trimmed !== "" && trimmed !== url ? trimmed : null;
  return { url, anchorTitle };
}

function collectLinkRefs(markdown: string): readonly PositionedRef[] {
  return [...markdown.matchAll(MARKDOWN_LINK_PATTERN)].flatMap<PositionedRef>(
    function (match) {
      const anchorText = match[1] ?? "";
      const url = match[2] ?? "";

      if (!isRefTarget(url)) {
        return [];
      }

      return [{ ...createCollectedRef(url, anchorText), index: match.index }];
    },
  );
}

function collectBlockUrlRefs(markdown: string): readonly PositionedRef[] {
  return [...markdown.matchAll(BLOCK_URL_PATTERN)].flatMap<PositionedRef>(
    function (match) {
    const url = match[1] ?? match[2] ?? "";

    if (!isRefTarget(url)) {
      return [];
    }

    return [{ url, anchorTitle: null, index: match.index }];
    },
  );
}

export function collectMonthlyRefs(markdown: string): readonly CollectedRef[] {
  const prose = markdown.replace(FENCED_CODE_PATTERN, "");

  return [...collectLinkRefs(prose), ...collectBlockUrlRefs(prose)]
    .toSorted(function (left, right) {
      return left.index - right.index;
    })
    .reduce<readonly CollectedRef[]>(function (refs, ref) {
      const existingIndex = refs.findIndex(function (candidate) {
        return candidate.url === ref.url;
      });

      if (existingIndex === -1) {
        return [...refs, { url: ref.url, anchorTitle: ref.anchorTitle }];
      }

      const existing = refs[existingIndex];

      if (
        existing === undefined ||
        existing.anchorTitle !== null ||
        ref.anchorTitle === null
      ) {
        return refs;
      }

      return refs.map(function (candidate, index) {
        return index === existingIndex
          ? { url: ref.url, anchorTitle: ref.anchorTitle }
          : candidate;
      });
    }, []);
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

export function shouldGenerateMonthlyRefs(
  page: PageState,
  headingTitles: readonly string[],
  now: Date,
  canLock: boolean,
): boolean {
  if (page.isMonthly !== true || headingTitles.includes(REFS_HEADING_TITLE)) {
    return false;
  }

  const pageMonth = getMonthlyPageMonth(page);
  const currentMonth = createMonthlyPageActionContext(now).currentMonth;

  if (compareCalendarMonths(pageMonth, currentMonth) !== -1) {
    return false;
  }

  // ロック済みの過去月は Refs 無しで閉じた状態なので、ロック計画とは無関係に補完する。
  return page.isLocked || canLock;
}

export function planMonthlyFinalizationSteps(
  refsPageIds: readonly string[],
  lockPageIds: readonly string[],
): readonly MonthlyFinalizationStep[] {
  const uniqueRefsPageIds = [...new Set(refsPageIds)];
  const uniqueLockPageIds = [...new Set(lockPageIds)];

  return [
    ...uniqueRefsPageIds.map(function (pageId) {
      return { type: "generate_refs" as const, pageId };
    }),
    ...uniqueLockPageIds.map(function (pageId) {
      return { type: "lock" as const, pageId };
    }),
  ];
}
