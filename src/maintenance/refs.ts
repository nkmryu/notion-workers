import type { Temporal } from "temporal-polyfill";

import type { DailyPage, PeriodArchive } from "../diary/page";
import type { DiaryStore } from "./diary-store";
import type { RefTitleResolutionCounts } from "./ref-title-lookup";

import { monthly } from "../diary/monthly";
import {
  buildRefsSection,
  collectRefs,
  hasRefsSection,
  shouldGenerateRefs,
} from "../diary/refs";
import { lookupRefTitles } from "./ref-title-lookup";

export interface RefsResult {
  readonly generated: number;
  readonly processed: number;
  readonly titleResolution: RefTitleResolutionCounts;
}

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
  archives: readonly PeriodArchive<Temporal.PlainYearMonth>[],
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<RefsResult> {
  const candidates = listCandidates(archives, dailies, today);
  let generated = 0;
  let titleResolution: RefTitleResolutionCounts = { http: 0, anchor: 0, fallback: 0 };

  for (const archive of candidates) {
    const markdown = await diary.getPageMarkdown(archive.id);

    // 事前判定に使った転記状態は取得時点の値なので、書き込み直前に読み直した本文で Refs の有無を再確認し、二重生成を防ぐ。
    if (hasRefsSection(markdown)) {
      continue;
    }

    const resolved = await lookupRefTitles(collectRefs(markdown));
    const section = buildRefsSection(resolved.refs);
    titleResolution = addCounts(titleResolution, resolved.counts);

    if (section !== "") {
      await diary.appendMarkdown(archive.id, section);
      generated += 1;
    }
  }

  return { generated, processed: candidates.length, titleResolution };
}
