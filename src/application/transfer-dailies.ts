import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { DiaryRepository } from "../domain/diary-repository";
import type { PeriodArchive } from "../domain/period";
import type { TransferPlan } from "../domain/transfer";

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
  // 本文の拒否で案内文へ切り替えた日
  readonly fallbackDates: readonly Temporal.PlainDate[];
}

function readDailyBodies(
  diary: DiaryRepository,
  dailyPageIds: readonly string[],
): Promise<readonly string[]> {
  return mapSequentially(dailyPageIds, function (pageId) {
    return diary.getPageMarkdown(pageId);
  });
}

function recordTransferred<K>(
  archives: readonly PeriodArchive<K>[],
  plan: TransferPlan,
): readonly PeriodArchive<K>[] {
  return archives.map(function (archive) {
    return archive.page.sameIdentityAs({ id: plan.destinationPageId })
      ? archive.withTransferred(plan.date)
      : archive;
  });
}

async function transferOne(
  diary: DiaryRepository,
  plan: TransferPlan,
): Promise<{ readonly fellBack: boolean }> {
  const bodies = await readDailyBodies(diary, plan.dailyPageIds);

  try {
    await diary.appendMarkdown(
      plan.destinationPageId,
      createTransferSection(plan.heading, bodies),
    );
    return { fellBack: false };
  } catch (error: unknown) {
    // 認証・レート制限・通信障害まで継続すると復旧判断を誤るため、本文の拒否以外は再 throw する。
    if (!(error instanceof ContentRejectedError)) {
      throw error;
    }
    await diary.appendMarkdown(
      plan.destinationPageId,
      createTransferFallbackSection(plan.heading, plan.dailyPageIds.map(diary.mentionOf)),
    );
    return { fellBack: true };
  }
}

export async function transferEndedDailies<K>(
  diary: DiaryRepository,
  dailies: readonly DailyPage[],
  archives: readonly PeriodArchive<K>[],
  today: Temporal.PlainDate,
): Promise<TransferResult<K>> {
  const plans = planTransfers(dailies, archives, today);
  const outcomes = await mapSequentially(plans, function (plan) {
    return transferOne(diary, plan);
  });

  return {
    // 転記した日は（案内文へ切り替えた日も含め）見出しが立つので、同じ実行内のロック判定へ反映する。
    archives: plans.reduce(recordTransferred, archives),
    daysTransferred: plans.length,
    fallbackDates: plans.flatMap(function (plan, index) {
      return outcomes[index]?.fellBack ? [plan.date] : [];
    }),
  };
}
