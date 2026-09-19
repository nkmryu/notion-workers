import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { PeriodArchive, PeriodPage } from "../domain/period";
import type { TransferPlan } from "../domain/transfer";
import type { DailyMarkdown } from "../domain/transfer-markdown";
import type { DiaryRepository } from "../domain/diary-repository";

import { parseDailyTitle } from "../domain/daily";
import { REFS_HEADING_TITLE } from "../domain/refs";
import {
  createTransferFallbackSection,
  createTransferSection,
} from "../domain/transfer-markdown";
import { planTransfers } from "../domain/transfer";
import { ContentRejectedError } from "../domain/diary-repository";
import { mapSequentially } from "../shared/sequence";

export interface TransferResult<K> {
  readonly archives: readonly PeriodArchive<K>[];
  readonly daysTransferred: number;
  readonly fallbackDates: readonly string[];
}

const EMPTY_ARCHIVE_STATE = { transferredDates: [], hasRefs: false } as const;

// 転記状態は期間ページの本文から読む。日付見出しが転記済みの日、Refs 見出しが Refs の有無を表す。
async function readArchiveState(
  diary: DiaryRepository,
  pageId: string,
): Promise<typeof EMPTY_ARCHIVE_STATE | { readonly transferredDates: readonly Temporal.PlainDate[]; readonly hasRefs: boolean }> {
  const sectionTitles = await diary.getSectionTitles(pageId);

  return {
    transferredDates: sectionTitles.flatMap(function (title) {
      const date = parseDailyTitle(title);
      return date === null ? [] : [date];
    }),
    hasRefs: sectionTitles.includes(REFS_HEADING_TITLE),
  };
}

function listArchives<K>(
  diary: DiaryRepository,
  periodPages: readonly PeriodPage<K>[],
  createdPageIds: readonly string[],
): Promise<readonly PeriodArchive<K>[]> {
  return mapSequentially(periodPages, async function (page) {
    // この実行で作った空ページと、ロック前の工程が無い期間のロック済みページは、読まなくても状態が決まる。
    const canSkipReading =
      createdPageIds.includes(page.id) || (page.isLocked && !page.period.hasBeforeLockStep);

    return page.withArchiveState(
      canSkipReading ? EMPTY_ARCHIVE_STATE : await readArchiveState(diary, page.id),
    );
  });
}

function readDailyMarkdowns(
  diary: DiaryRepository,
  dailyPageIds: readonly string[],
): Promise<readonly DailyMarkdown[]> {
  return mapSequentially(dailyPageIds, async function (pageId) {
    return { pageId, markdown: await diary.getPageMarkdown(pageId) };
  });
}

function recordTransferred<K>(
  archives: readonly PeriodArchive<K>[],
  plan: TransferPlan,
): readonly PeriodArchive<K>[] {
  return archives.map(function (archive) {
    return archive.id === plan.destinationPageId ? archive.withTransferred(plan.date) : archive;
  });
}

async function transferOne(
  diary: DiaryRepository,
  plan: TransferPlan,
): Promise<{ readonly fellBack: boolean }> {
  const dailies = await readDailyMarkdowns(diary, plan.dailyPageIds);

  try {
    await diary.appendMarkdown(
      plan.destinationPageId,
      createTransferSection(plan.title, dailies),
    );
    return { fellBack: false };
  } catch (error: unknown) {
    // 認証・レート制限・通信障害まで継続すると復旧判断を誤るため、本文の拒否以外は再 throw する。
    if (!(error instanceof ContentRejectedError)) {
      throw error;
    }
    await diary.appendMarkdown(
      plan.destinationPageId,
      createTransferFallbackSection(plan.title, plan.dailyPageIds),
    );
    return { fellBack: true };
  }
}

export async function transferEndedDailies<K>(
  diary: DiaryRepository,
  dailies: readonly DailyPage[],
  periodPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
  createdPageIds: readonly string[],
): Promise<TransferResult<K>> {
  const archives = await listArchives(diary, periodPages, createdPageIds);
  const plans = planTransfers(dailies, archives, today);
  const outcomes = await mapSequentially(plans, function (plan) {
    return transferOne(diary, plan);
  });

  return {
    // 転記した日は（案内文へ切り替えた日も含め）見出しが立つので、同じ実行内のロック判定へ反映する。
    archives: plans.reduce(recordTransferred, archives),
    daysTransferred: plans.length,
    fallbackDates: plans.flatMap(function (plan, index) {
      return outcomes[index]?.fellBack ? [plan.title] : [];
    }),
  };
}
