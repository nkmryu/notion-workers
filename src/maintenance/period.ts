import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../diary/daily";
import type { PeriodArchive, PeriodCreationPlan, PeriodDefinition } from "../diary/period";
import type { DiaryStore } from "./diary-store";

import { PAGE_ACTION_TYPE } from "../diary/page";
import { PeriodPage, planMissingPeriodPages } from "../diary/period";
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

export interface PeriodMaintenanceResult<F> {
  readonly created: number;
  readonly daysTransferred: number;
  readonly fallbackDates: readonly string[];
  readonly beforeLockResult: F;
  readonly renames: number;
  readonly locks: number;
}

async function createPeriodPages<K>(
  diary: DiaryStore,
  period: PeriodDefinition<K>,
  templateId: string,
  plans: readonly PeriodCreationPlan<K>[],
): Promise<readonly PeriodPage<K>[]> {
  let created: readonly PeriodPage<K>[] = [];

  for (const plan of plans) {
    const pageId = await diary.createPageFromTemplate({ templateId, title: plan.title });
    // テンプレートの非同期適用後にも期間タイトルを確定させるため、同一実行でリネーム対象にする。
    created = [
      ...created,
      new PeriodPage(period, { id: pageId, title: "", isLocked: false, key: plan.key }),
    ];
  }

  return created;
}

// 期間ページを最新状態にする: 終了した期間のページを作り、Daily を転記し、ロック前の工程を済ませてからリネーム・ロックする。
export async function maintainPeriod<K, F>(
  diary: DiaryStore,
  maintenance: PeriodMaintenance<K, F>,
  dailies: readonly DailyPage[],
  existingPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
): Promise<PeriodMaintenanceResult<F>> {
  const { period, templateId } = maintenance;
  const createdPages = await createPeriodPages(
    diary,
    period,
    templateId,
    planMissingPeriodPages(period, dailies, existingPages, today),
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
    const action = archive.decideAction(dailies, today);
    return action.type === PAGE_ACTION_TYPE.none ? [] : [{ page: archive, action }];
  });
  const beforeLockResult = await maintenance.beforeLock({ archives: transfer.archives, dailies, today });
  let renames = 0;
  let locks = 0;

  for (const { page, action } of actions) {
    if (action.type === PAGE_ACTION_TYPE.rename) {
      await diary.renamePage(page.id, action.title);
      renames += 1;
    } else {
      await diary.lockPage(page.id);
      locks += 1;
    }
  }

  return {
    created: createdPages.length,
    daysTransferred: transfer.daysTransferred,
    fallbackDates: transfer.fallbackDates,
    beforeLockResult,
    renames,
    locks,
  };
}
