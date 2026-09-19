import type { Client } from "@notionhq/client";

import type { MonthlyTransferPage } from "./daily-transfer";
import type { NotionPage } from "./notion-response";
import type { RefTitleResolutionCounts } from "./ref-title-resolver";

import {
  buildRefsSection,
  collectMonthlyRefs,
  shouldGenerateMonthlyRefs,
} from "./monthly-refs";
import {
  compareCalendarMonths,
  getMonthlyPageMonth,
} from "./monthly-page";
import { restoreExternalLinks } from "./block-link-resolver";
import { appendMarkdown, getPageMarkdown } from "./notion-client";
import { resolveRefTitles } from "./ref-title-resolver";
import { extractHeadingTitles } from "./transfer-markdown";

const WRITE_INTERVAL_MS = 350;

export interface GenerateMonthlyRefsInput {
  readonly notion: Client;
  readonly pages: readonly NotionPage[];
  readonly monthlies: readonly MonthlyTransferPage[];
  readonly monthlyLockPageIds: readonly string[];
  readonly now: Date;
}

export interface MonthlyRefsResult {
  readonly generated: number;
  readonly processed: number;
  readonly titleResolution: RefTitleResolutionCounts;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

function getHeadingTitles(
  pageId: string,
  monthlies: readonly MonthlyTransferPage[],
): readonly string[] {
  return (
    monthlies.find(function (monthly) {
      return monthly.id === pageId;
    })?.headingTitles ?? []
  );
}

function isLockPlanned(
  pageId: string,
  monthlyLockPageIds: readonly string[],
): boolean {
  return monthlyLockPageIds.includes(pageId);
}

export async function generateMonthlyRefs(
  input: GenerateMonthlyRefsInput,
): Promise<MonthlyRefsResult> {
  const candidates = input.pages
    .filter(function (page) {
      return shouldGenerateMonthlyRefs(
        page,
        getHeadingTitles(page.id, input.monthlies),
        input.now,
        isLockPlanned(page.id, input.monthlyLockPageIds),
      );
    })
    .toSorted(function (left, right) {
      const comparison = compareCalendarMonths(
        getMonthlyPageMonth(left),
        getMonthlyPageMonth(right),
      );
      return comparison === 0 ? left.id.localeCompare(right.id) : comparison;
    });
  let generated = 0;
  let titleResolution: RefTitleResolutionCounts = {
    http: 0,
    anchor: 0,
    fallback: 0,
  };

  for (const page of candidates) {
    const markdown = await getPageMarkdown(input.notion, page.id);
    // 事前判定に使った見出し一覧は取得時点の値なので、書き込み直前に読み直した本文で Refs の有無を再判定し、二重生成を防ぐ。
    const shouldGenerate = shouldGenerateMonthlyRefs(
      page,
      extractHeadingTitles(markdown),
      input.now,
      isLockPlanned(page.id, input.monthlyLockPageIds),
    );

    if (!shouldGenerate) {
      continue;
    }

    // 旧方式で転記済みの月には bookmark ブロックが残っているため、Refs 収集前に外部 URL を復元する。
    const resolved = await resolveRefTitles(
      collectMonthlyRefs(await restoreExternalLinks(input.notion, markdown)),
    );
    const section = buildRefsSection(resolved.refs);

    titleResolution = {
      http: titleResolution.http + resolved.counts.http,
      anchor: titleResolution.anchor + resolved.counts.anchor,
      fallback: titleResolution.fallback + resolved.counts.fallback,
    };

    if (section !== "") {
      await appendMarkdown(input.notion, page.id, section);
      await sleep(WRITE_INTERVAL_MS);
      generated += 1;
    }
  }

  return {
    generated,
    processed: candidates.length,
    titleResolution,
  };
}
