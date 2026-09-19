import type { DailyPage, PeriodArchive, PeriodPage } from "../diary/page";
import type { PeriodDefinition } from "../diary/period";
import type { TransferPlan } from "../diary/transfer-plan";
import type { DailyMarkdown } from "../diary/transfer-markdown";
import type { NotionDiary } from "../notion/client";

import { parseDailyTitleDateKey } from "../diary/daily-title";
import { extractSectionTitles } from "../diary/markdown-section";
import { hasRefsSection } from "../diary/refs";
import {
  createTransferFallbackSection,
  createTransferSection,
} from "../diary/transfer-markdown";
import { planTransfers } from "../diary/transfer-plan";
import { isNotionValidationError } from "../notion/error";
import { READ_INTERVAL_MS, WRITE_INTERVAL_MS, sleep } from "../notion/pacing";
import { restoreExternalLinks } from "./external-links";

export interface TransferResult<K> {
  readonly archives: readonly PeriodArchive<K>[];
  readonly daysTransferred: number;
  readonly fallbackDates: readonly string[];
}

const EMPTY_ARCHIVE_STATE = { transferredDateKeys: [], hasRefs: false } as const;

// 転記状態は期間ページの本文から読む。日付見出しが転記済みの日、Refs 見出しが Refs の有無を表す。
async function readArchiveState(
  diary: NotionDiary,
  pageId: string,
): Promise<Pick<PeriodArchive<unknown>, "transferredDateKeys" | "hasRefs">> {
  const markdown = await diary.getPageMarkdown(pageId);
  await sleep(READ_INTERVAL_MS);

  return {
    transferredDateKeys: extractSectionTitles(markdown).flatMap(function (title) {
      const dateKey = parseDailyTitleDateKey(title);
      return dateKey === null ? [] : [dateKey];
    }),
    hasRefs: hasRefsSection(markdown),
  };
}

async function listArchives<K>(
  diary: NotionDiary,
  period: PeriodDefinition<K>,
  periodPages: readonly PeriodPage<K>[],
  createdPageIds: readonly string[],
): Promise<readonly PeriodArchive<K>[]> {
  let archives: readonly PeriodArchive<K>[] = [];

  for (const page of periodPages) {
    // この実行で作った空ページと、仕上げ工程の無い期間のロック済みページは読まなくても状態が決まる。
    const canSkipReading =
      createdPageIds.includes(page.id) ||
      (page.isLocked && !period.finalizesAfterLock);
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
  diary: NotionDiary,
  dailyPageIds: readonly string[],
): Promise<readonly DailyMarkdown[]> {
  let dailies: readonly DailyMarkdown[] = [];

  for (const pageId of dailyPageIds) {
    const markdown = await diary.getPageMarkdown(pageId);
    await sleep(READ_INTERVAL_MS);
    dailies = [
      ...dailies,
      { pageId, markdown: await restoreExternalLinks(diary, markdown) },
    ];
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
      ? { ...archive, transferredDateKeys: [...archive.transferredDateKeys, plan.dateKey] }
      : archive;
  });
}

async function transferOne(
  diary: NotionDiary,
  plan: TransferPlan,
): Promise<{ readonly fellBack: boolean }> {
  const dailies = await readDailyMarkdowns(diary, plan.dailyPageIds);

  try {
    await diary.appendMarkdown(
      plan.destinationPageId,
      createTransferSection(plan.title, dailies),
    );
    await sleep(WRITE_INTERVAL_MS);
    return { fellBack: false };
  } catch (error: unknown) {
    // 認証・レート制限・通信障害まで継続すると復旧判断を誤るため、書式検証エラー以外は再 throw する。
    if (!isNotionValidationError(error)) {
      throw error;
    }

    await sleep(WRITE_INTERVAL_MS);
    await diary.appendMarkdown(
      plan.destinationPageId,
      createTransferFallbackSection(plan.title, plan.dailyPageIds),
    );
    await sleep(WRITE_INTERVAL_MS);
    return { fellBack: true };
  }
}

export async function transferEndedDailies<K>(
  diary: NotionDiary,
  period: PeriodDefinition<K>,
  dailies: readonly DailyPage[],
  periodPages: readonly PeriodPage<K>[],
  now: Date,
  createdPageIds: readonly string[],
): Promise<TransferResult<K>> {
  let archives = await listArchives(diary, period, periodPages, createdPageIds);
  const plans = planTransfers(period, dailies, archives, now);
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
