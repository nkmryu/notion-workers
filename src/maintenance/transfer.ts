import type { Temporal } from "temporal-polyfill";

import type { DailyPage, PeriodArchive, PeriodPage } from "../diary/page";
import type { PeriodDefinition } from "../diary/period";
import type { TransferPlan } from "../diary/transfer-plan";
import type { DailyMarkdown } from "../diary/transfer-markdown";
import type { DiaryStore } from "./diary-store";

import { parseDailyTitle } from "../diary/daily";
import { REFS_HEADING_TITLE } from "../diary/refs";
import {
  createTransferFallbackSection,
  createTransferSection,
} from "../diary/transfer-markdown";
import { planTransfers } from "../diary/transfer-plan";
import { ContentRejectedError } from "./diary-store";

export interface TransferResult<K> {
  readonly archives: readonly PeriodArchive<K>[];
  readonly daysTransferred: number;
  readonly fallbackDates: readonly string[];
}

const EMPTY_ARCHIVE_STATE = { transferredDates: [], hasRefs: false } as const;

// 転記状態は期間ページの本文から読む。日付見出しが転記済みの日、Refs 見出しが Refs の有無を表す。
async function readArchiveState(
  diary: DiaryStore,
  pageId: string,
): Promise<Pick<PeriodArchive<unknown>, "transferredDates" | "hasRefs">> {
  const sectionTitles = await diary.getSectionTitles(pageId);

  return {
    transferredDates: sectionTitles.flatMap(function (title) {
      const date = parseDailyTitle(title);
      return date === null ? [] : [date];
    }),
    hasRefs: sectionTitles.includes(REFS_HEADING_TITLE),
  };
}

async function listArchives<K>(
  diary: DiaryStore,
  period: PeriodDefinition<K>,
  periodPages: readonly PeriodPage<K>[],
  createdPageIds: readonly string[],
): Promise<readonly PeriodArchive<K>[]> {
  let archives: readonly PeriodArchive<K>[] = [];

  for (const page of periodPages) {
    // この実行で作った空ページと、ロック前の工程が無い期間のロック済みページは、読まなくても状態が決まる。
    const canSkipReading =
      createdPageIds.includes(page.id) ||
      (page.isLocked && !period.hasBeforeLockStep);
    archives = [
      ...archives,
      {
        ...page,
        ...(canSkipReading ? EMPTY_ARCHIVE_STATE : await readArchiveState(diary, page.id)),
      },
    ];
  }

  return archives;
}

async function readDailyMarkdowns(
  diary: DiaryStore,
  dailyPageIds: readonly string[],
): Promise<readonly DailyMarkdown[]> {
  let dailies: readonly DailyMarkdown[] = [];

  for (const pageId of dailyPageIds) {
    dailies = [...dailies, { pageId, markdown: await diary.getPageMarkdown(pageId) }];
  }

  return dailies;
}

// 転記できた日はメモリ上の転記状態にも足し、同じ実行内のロック判定へ反映する。
function recordTransferred<K>(
  archives: readonly PeriodArchive<K>[],
  plan: TransferPlan,
): readonly PeriodArchive<K>[] {
  return archives.map(function (archive) {
    return archive.id === plan.destinationPageId
      ? { ...archive, transferredDates: [...archive.transferredDates, plan.date] }
      : archive;
  });
}

async function transferOne(
  diary: DiaryStore,
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
  diary: DiaryStore,
  period: PeriodDefinition<K>,
  dailies: readonly DailyPage[],
  periodPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
  createdPageIds: readonly string[],
): Promise<TransferResult<K>> {
  let archives = await listArchives(diary, period, periodPages, createdPageIds);
  const plans = planTransfers(period, dailies, archives, today);
  let fallbackDates: readonly string[] = [];

  for (const plan of plans) {
    const { fellBack } = await transferOne(diary, plan);

    if (fellBack) {
      fallbackDates = [...fallbackDates, plan.title];
    }

    archives = recordTransferred(archives, plan);
  }

  return { archives, daysTransferred: plans.length, fallbackDates };
}
