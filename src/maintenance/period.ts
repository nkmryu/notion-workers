import type { DailyPage, PeriodPage } from "../diary/page";
import type { PeriodCreationPlan, PeriodDefinition } from "../diary/period";
import type { TransferDestination } from "../diary/transfer-plan";
import type { NotionDiary } from "../notion/client";

import { PAGE_ACTION_TYPE } from "../diary/daily";
import {
  decidePeriodPageAction,
  planMissingPeriodPages,
  shouldLockPeriodPage,
} from "../diary/period";
import { WRITE_INTERVAL_MS, sleep } from "../notion/pacing";
import { transferEndedDailies } from "./transfer";

// ロック前の仕上げ（Monthly の Refs）。ロック済みで仕上げが無いページの補完も担う。
export interface FinalizeInput<K> {
  readonly destinations: readonly TransferDestination<K>[];
  readonly lockPlannedPageIds: readonly string[];
  readonly now: Date;
}

export interface PeriodMaintenance<K, F> {
  readonly period: PeriodDefinition<K>;
  readonly templateId: string;
  readonly finalize: (input: FinalizeInput<K>) => Promise<F>;
}

export interface PeriodMaintenanceResult<F> {
  readonly created: number;
  readonly daysTransferred: number;
  readonly fallbackDates: readonly string[];
  readonly finalized: F;
  readonly renames: number;
  readonly locks: number;
}

async function createPeriodPages<K>(
  diary: NotionDiary,
  templateId: string,
  plans: readonly PeriodCreationPlan<K>[],
): Promise<readonly PeriodPage<K>[]> {
  let created: readonly PeriodPage<K>[] = [];

  for (const plan of plans) {
    const pageId = await diary.createPageFromTemplate({ templateId, title: plan.title });
    await sleep(WRITE_INTERVAL_MS);
    // テンプレートの非同期適用後にも期間タイトルを確定させるため、同一実行でリネーム対象にする。
    created = [...created, { id: pageId, title: "", isLocked: false, key: plan.key }];
  }

  return created;
}

// 期間ページを最新状態にする: 終了した期間のページを作り、Daily を転記し、仕上げてからリネーム・ロックする。
export async function maintainPeriod<K, F>(
  diary: NotionDiary,
  maintenance: PeriodMaintenance<K, F>,
  dailies: readonly DailyPage[],
  existingPages: readonly PeriodPage<K>[],
  now: Date,
): Promise<PeriodMaintenanceResult<F>> {
  const { period, templateId } = maintenance;
  const createdPages = await createPeriodPages(
    diary,
    templateId,
    planMissingPeriodPages(period, dailies, existingPages, now),
  );
  const transfer = await transferEndedDailies(
    diary,
    period,
    dailies,
    [...existingPages, ...createdPages],
    now,
    createdPages.map(function (page) {
      return page.id;
    }),
  );
  const actions = transfer.destinations.flatMap(function (page) {
    const canLock = shouldLockPeriodPage(period, page, dailies, page.headingTitles, now);
    const action = decidePeriodPageAction(period, page, now, canLock);
    return action.type === PAGE_ACTION_TYPE.none ? [] : [{ page, action }];
  });
  const finalized = await maintenance.finalize({
    destinations: transfer.destinations,
    lockPlannedPageIds: actions.flatMap(function ({ page, action }) {
      return action.type === PAGE_ACTION_TYPE.lock ? [page.id] : [];
    }),
    now,
  });
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

    await sleep(WRITE_INTERVAL_MS);
  }

  return {
    created: createdPages.length,
    daysTransferred: transfer.daysTransferred,
    fallbackDates: transfer.fallbackDates,
    finalized,
    renames,
    locks,
  };
}
