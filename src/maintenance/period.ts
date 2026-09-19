import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../diary/daily";
import type { PeriodArchive, PeriodDefinition } from "../diary/period";
import type { DiaryStore } from "./diary-store";
import type { PageActionCounts } from "./page-actions";

import { PeriodPage, planMissingPeriodPages } from "../diary/period";
import { applyPageActions, planPageAction } from "./page-actions";
import { mapSequentially } from "../shared/sequence";
import { transferEndedDailies } from "./transfer";

// ロック前に行う工程（Monthly の Refs）への入力。工程を飛ばしてロックされたページの補完も担う。
export interface BeforeLockInput<K> {
  readonly archives: readonly PeriodArchive<K>[];
  readonly dailies: readonly DailyPage[];
  readonly today: Temporal.PlainDate;
}

export interface PeriodMaintenance<K, F> {
  readonly period: PeriodDefinition<K>;
  readonly templateId: string;
  readonly beforeLock: (input: BeforeLockInput<K>) => Promise<F>;
}

export interface PeriodMaintenanceResult<F> extends PageActionCounts {
  readonly created: number;
  readonly daysTransferred: number;
  readonly fallbackDates: readonly string[];
  readonly beforeLockResult: F;
}

// 期間ページを最新状態にする: 終了した期間のページを作り、Daily を転記し、ロック前の工程を済ませてからリネーム・ロックする。
export async function maintainPeriod<K, F>(
  diary: DiaryStore,
  { period, templateId, beforeLock }: PeriodMaintenance<K, F>,
  dailies: readonly DailyPage[],
  existingPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
): Promise<PeriodMaintenanceResult<F>> {
  const createdPages = await mapSequentially(
    planMissingPeriodPages(period, dailies, existingPages, today),
    async function (plan) {
      const id = await diary.createPageFromTemplate({ templateId, title: plan.title });
      // テンプレートの非同期適用後にも期間タイトルを確定させるため、同一実行でリネーム対象にする。
      return new PeriodPage(period, { id, title: "", isLocked: false, key: plan.key });
    },
  );
  const transfer = await transferEndedDailies(
    diary,
    dailies,
    [...existingPages, ...createdPages],
    today,
    createdPages.map(function (page) {
      return page.id;
    }),
  );
  const actions = transfer.archives.flatMap(function (archive) {
    return planPageAction(archive.id, archive.decideAction(dailies, today));
  });
  const beforeLockResult = await beforeLock({ archives: transfer.archives, dailies, today });
  const counts = await applyPageActions(diary, actions);

  return {
    created: createdPages.length,
    daysTransferred: transfer.daysTransferred,
    fallbackDates: transfer.fallbackDates,
    beforeLockResult,
    ...counts,
  };
}
