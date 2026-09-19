import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../diary/daily";
import type { PeriodArchive } from "../diary/period";
import type { CollectedRef, RefTitleSource, ResolvedRef } from "../diary/refs";
import type { DiaryStore } from "./diary-store";
import type { PageTitleSource } from "./page-title-source";

import { monthly } from "../diary/monthly";
import {
  buildRefsSection,
  collectRefs,
  hasRefsSection,
  selectRefTitle,
  shouldGenerateRefs,
} from "../diary/refs";

export type RefTitleResolutionCounts = Readonly<Record<RefTitleSource, number>>;

export interface RefsResult {
  readonly generated: number;
  readonly processed: number;
  readonly titleResolution: RefTitleResolutionCounts;
}

const NO_RESOLUTION: RefTitleResolutionCounts = { http: 0, anchor: 0, fallback: 0 };

function addCounts(
  left: RefTitleResolutionCounts,
  right: RefTitleResolutionCounts,
): RefTitleResolutionCounts {
  return {
    http: left.http + right.http,
    anchor: left.anchor + right.anchor,
    fallback: left.fallback + right.fallback,
  };
}

// アンカーテキストが無い URL だけページタイトルを引き、出どころごとの件数も数える。
async function resolveRefTitles(
  titles: PageTitleSource,
  refs: readonly CollectedRef[],
): Promise<{ readonly refs: readonly ResolvedRef[]; readonly counts: RefTitleResolutionCounts }> {
  let resolved: readonly ResolvedRef[] = [];
  let counts = NO_RESOLUTION;

  for (const ref of refs) {
    const httpTitle = ref.anchorTitle === null ? await titles.lookupTitle(ref.url) : null;
    const selected = selectRefTitle(ref, httpTitle);
    resolved = [...resolved, { url: selected.url, title: selected.title }];
    counts = { ...counts, [selected.source]: counts[selected.source] + 1 };
  }

  return { refs: resolved, counts };
}

function listCandidates(
  archives: readonly PeriodArchive<Temporal.PlainYearMonth>[],
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): readonly PeriodArchive<Temporal.PlainYearMonth>[] {
  return archives
    .filter(function (archive) {
      return shouldGenerateRefs(archive, dailies, today);
    })
    .toSorted(function (left, right) {
      const comparison = monthly.compare(left.key, right.key);
      return comparison === 0 ? left.id.localeCompare(right.id) : comparison;
    });
}

// 過去月の Monthly へ、本文中の外部 URL をまとめた Refs セクションを追記する。
export async function generateRefs(
  diary: DiaryStore,
  titles: PageTitleSource,
  archives: readonly PeriodArchive<Temporal.PlainYearMonth>[],
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<RefsResult> {
  const candidates = listCandidates(archives, dailies, today);
  let generated = 0;
  let titleResolution = NO_RESOLUTION;

  for (const archive of candidates) {
    const markdown = await diary.getPageMarkdown(archive.id);

    // 事前判定に使った転記状態は取得時点の値なので、書き込み直前に読み直した本文で Refs の有無を再確認し、二重生成を防ぐ。
    if (hasRefsSection(markdown)) {
      continue;
    }

    const resolved = await resolveRefTitles(titles, collectRefs(markdown));
    const section = buildRefsSection(resolved.refs);
    titleResolution = addCounts(titleResolution, resolved.counts);

    if (section !== "") {
      await diary.appendMarkdown(archive.id, section);
      generated += 1;
    }
  }

  return { generated, processed: candidates.length, titleResolution };
}
