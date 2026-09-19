import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { PeriodArchive } from "../domain/period";
import type { CollectedRef, RefTitleSource, ResolvedRef } from "../domain/refs";
import type { DiaryRepository } from "../domain/diary-repository";
import type { WebPageTitleLookup } from "./web-page-title-lookup";

import { REF_TITLE_SOURCE } from "../domain/refs";
import { countBy, mapSequentially } from "../shared/sequence";

import { monthly } from "../domain/monthly";
import {
  buildRefsSection,
  collectRefs,
  hasRefsSection,
  selectRefTitle,
  shouldGenerateRefs,
} from "../domain/refs";

export type RefTitleResolutionCounts = Readonly<Record<RefTitleSource, number>>;

export interface RefsResult {
  readonly generated: number;
  readonly processed: number;
  readonly titleResolution: RefTitleResolutionCounts;
}

const NO_RESOLUTION: RefTitleResolutionCounts = { anchor: 0, linked_page: 0, url: 0 };

function addCounts(
  left: RefTitleResolutionCounts,
  right: RefTitleResolutionCounts,
): RefTitleResolutionCounts {
  return Object.fromEntries(
    Object.values(REF_TITLE_SOURCE).map(function (source) {
      return [source, left[source] + right[source]];
    }),
  ) as RefTitleResolutionCounts;
}

// アンカーテキストが無い URL だけページタイトルを引き、出どころごとの件数も数える。
async function resolveRefTitles(
  titles: WebPageTitleLookup,
  refs: readonly CollectedRef[],
): Promise<{ readonly refs: readonly ResolvedRef[]; readonly counts: RefTitleResolutionCounts }> {
  const selected = await mapSequentially(refs, async function (ref) {
    const linkedPageTitle = ref.anchorTitle === null ? await titles.lookupTitle(ref.url) : null;
    return selectRefTitle(ref, linkedPageTitle);
  });

  return {
    refs: selected.map(function ({ url, title }) {
      return { url, title };
    }),
    counts: countBy(
      selected,
      function ({ source }) {
        return source;
      },
      Object.values(REF_TITLE_SOURCE),
    ),
  };
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

interface RefsOutcome {
  readonly generated: boolean;
  readonly counts: RefTitleResolutionCounts;
}

async function generateRefsFor(
  diary: DiaryRepository,
  titles: WebPageTitleLookup,
  archive: PeriodArchive<Temporal.PlainYearMonth>,
): Promise<RefsOutcome> {
  const markdown = await diary.getPageMarkdown(archive.id);

  // 同じ実行内で Refs を書くのはここだけで、同時実行は workflow の concurrency が防ぐ。
  // それでも本文を読み直して再確認するのは、手作業で Refs が追記された月への二重生成を防ぐため。
  if (hasRefsSection(markdown)) {
    return { generated: false, counts: NO_RESOLUTION };
  }

  const resolved = await resolveRefTitles(titles, collectRefs(markdown));
  const section = buildRefsSection(resolved.refs);

  if (section === "") {
    return { generated: false, counts: resolved.counts };
  }

  await diary.appendMarkdown(archive.id, section);
  return { generated: true, counts: resolved.counts };
}

// 過去月の Monthly へ、本文中の外部 URL をまとめた Refs セクションを追記する。
export async function generateRefs(
  diary: DiaryRepository,
  titles: WebPageTitleLookup,
  archives: readonly PeriodArchive<Temporal.PlainYearMonth>[],
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<RefsResult> {
  const candidates = listCandidates(archives, dailies, today);
  const outcomes = await mapSequentially(candidates, function (archive) {
    return generateRefsFor(diary, titles, archive);
  });

  return {
    generated: outcomes.filter(function ({ generated }) {
      return generated;
    }).length,
    processed: candidates.length,
    titleResolution: outcomes.reduce(function (total, { counts }) {
      return addCounts(total, counts);
    }, NO_RESOLUTION),
  };
}
