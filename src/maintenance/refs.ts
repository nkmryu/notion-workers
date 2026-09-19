import type { DiaryPage } from "../diary/page";
import type { TransferDestination } from "../diary/transfer-plan";
import type { NotionDiary } from "../notion/client";
import type { RefTitleResolutionCounts } from "./ref-title-lookup";

import { monthly } from "../diary/monthly";
import { getPeriodPageKey } from "../diary/period";
import { buildRefsSection, collectRefs, shouldGenerateRefs } from "../diary/refs";
import { extractSectionTitles } from "../diary/markdown-section";
import { WRITE_INTERVAL_MS, sleep } from "../notion/pacing";
import { restoreExternalLinks } from "./external-links";
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
  pages: readonly DiaryPage[],
  destinations: readonly TransferDestination<unknown>[],
  lockPlannedPageIds: readonly string[],
  now: Date,
): readonly DiaryPage[] {
  return pages
    .filter(function (page) {
      const headingTitles =
        destinations.find(function (destination) {
          return destination.id === page.id;
        })?.headingTitles ?? [];

      return shouldGenerateRefs(
        page,
        headingTitles,
        now,
        lockPlannedPageIds.includes(page.id),
      );
    })
    .toSorted(function (left, right) {
      const comparison = monthly.compare(
        getPeriodPageKey(monthly, left),
        getPeriodPageKey(monthly, right),
      );
      return comparison === 0 ? left.id.localeCompare(right.id) : comparison;
    });
}

// 過去月の Monthly へ、本文中の外部 URL をまとめた Refs セクションを追記する。
export async function generateRefs(
  diary: NotionDiary,
  pages: readonly DiaryPage[],
  destinations: readonly TransferDestination<unknown>[],
  lockPlannedPageIds: readonly string[],
  now: Date,
): Promise<RefsResult> {
  const candidates = listCandidates(pages, destinations, lockPlannedPageIds, now);
  let generated = 0;
  let titleResolution: RefTitleResolutionCounts = { http: 0, anchor: 0, fallback: 0 };

  for (const page of candidates) {
    const markdown = await diary.getPageMarkdown(page.id);
    // 事前判定に使った見出し一覧は取得時点の値なので、書き込み直前に読み直した本文で Refs の有無を再判定し、二重生成を防ぐ。
    const stillNeeded = shouldGenerateRefs(
      page,
      extractSectionTitles(markdown),
      now,
      lockPlannedPageIds.includes(page.id),
    );

    if (!stillNeeded) {
      continue;
    }

    // 旧方式で転記済みの月には bookmark ブロックが残っているため、Refs 収集前に外部 URL を復元する。
    const resolved = await lookupRefTitles(
      collectRefs(await restoreExternalLinks(diary, markdown)),
    );
    const section = buildRefsSection(resolved.refs);
    titleResolution = addCounts(titleResolution, resolved.counts);

    if (section !== "") {
      await diary.appendMarkdown(page.id, section);
      await sleep(WRITE_INTERVAL_MS);
      generated += 1;
    }
  }

  return { generated, processed: candidates.length, titleResolution };
}
