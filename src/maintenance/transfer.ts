import type { DailyPage, PeriodPage } from "../diary/page";
import type { PeriodDefinition } from "../diary/period";
import type { TransferDestination, TransferPlan } from "../diary/transfer-plan";
import type { DailyMarkdown } from "../diary/transfer-markdown";
import type { NotionDiary } from "../notion/client";

import { extractSectionTitles } from "../diary/markdown-section";
import {
  createTransferFallbackSection,
  createTransferSection,
} from "../diary/transfer-markdown";
import { planTransfers } from "../diary/transfer-plan";
import { isNotionValidationError } from "../notion/error";
import { READ_INTERVAL_MS, WRITE_INTERVAL_MS, sleep } from "../notion/pacing";
import { restoreExternalLinks } from "./external-links";

export interface TransferResult<K> {
  readonly destinations: readonly TransferDestination<K>[];
  readonly daysTransferred: number;
  readonly fallbackDates: readonly string[];
}

async function readHeadingTitles(
  diary: NotionDiary,
  pageId: string,
): Promise<readonly string[]> {
  const headingTitles = extractSectionTitles(await diary.getPageMarkdown(pageId));
  await sleep(READ_INTERVAL_MS);

  return headingTitles;
}

async function listDestinations<K>(
  diary: NotionDiary,
  period: PeriodDefinition<K>,
  periodPages: readonly PeriodPage<K>[],
  knownEmptyPageIds: readonly string[],
): Promise<readonly TransferDestination<K>[]> {
  let destinations: readonly TransferDestination<K>[] = [];

  for (const page of periodPages) {
    const canSkipReading =
      knownEmptyPageIds.includes(page.id) ||
      (page.isLocked && !period.finalizesAfterLock);
    destinations = [
      ...destinations,
      {
        ...page,
        headingTitles: canSkipReading ? [] : await readHeadingTitles(diary, page.id),
      },
    ];
  }

  return destinations;
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

// 転記できた日は見出しをメモリ上の転記先にも足し、同じ実行内のロック判定へ反映する。
function recordTransferred<K>(
  destinations: readonly TransferDestination<K>[],
  plan: TransferPlan,
): readonly TransferDestination<K>[] {
  return destinations.map(function (destination) {
    return destination.id === plan.destinationPageId
      ? { ...destination, headingTitles: [...destination.headingTitles, plan.title] }
      : destination;
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
  knownEmptyPageIds: readonly string[],
): Promise<TransferResult<K>> {
  let destinations = await listDestinations(diary, period, periodPages, knownEmptyPageIds);
  const plans = planTransfers(period, dailies, destinations, now);
  let fallbackDates: readonly string[] = [];

  for (const plan of plans) {
    const { fellBack } = await transferOne(diary, plan);

    if (fellBack) {
      fallbackDates = [...fallbackDates, plan.title];
    }

    destinations = recordTransferred(destinations, plan);
  }

  return { destinations, daysTransferred: plans.length, fallbackDates };
}
