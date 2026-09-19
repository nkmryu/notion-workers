import type { DiaryPage } from "../diary/page";
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
  readonly pages: readonly DiaryPage[];
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
  period: PeriodDefinition<K>,
  templateId: string,
  plans: readonly PeriodCreationPlan<K>[],
): Promise<readonly DiaryPage[]> {
  let created: readonly DiaryPage[] = [];

  for (const plan of plans) {
    const pageId = await diary.createPageFromTemplate({ templateId, title: plan.title });
    await sleep(WRITE_INTERVAL_MS);
    created = [
      ...created,
      {
        id: pageId,
        createdTime: plan.representativeCreatedTime,
        // テンプレートの非同期適用後にも期間タイトルを確定させるため、同一実行でリネーム対象にする。
        title: "",
        isLocked: false,
        periodType: period.type,
      },
    ];
  }

  return created;
}

function findHeadingTitles<K>(
  destinations: readonly TransferDestination<K>[],
  pageId: string,
): readonly string[] {
  return (
    destinations.find(function (destination) {
      return destination.id === pageId;
    })?.headingTitles ?? []
  );
}

// 期間ページを最新状態にする: 終了した期間のページを作り、Daily を転記し、仕上げてからリネーム・ロックする。
export async function maintainPeriod<K, F>(
  diary: NotionDiary,
  maintenance: PeriodMaintenance<K, F>,
  existingPages: readonly DiaryPage[],
  now: Date,
): Promise<PeriodMaintenanceResult<F>> {
  const { period, templateId } = maintenance;
  const createdPages = await createPeriodPages(
    diary,
    period,
    templateId,
    planMissingPeriodPages(period, existingPages, now),
  );
  const pages = [...existingPages, ...createdPages];
  const transfer = await transferEndedDailies(
    diary,
    period,
    pages,
    now,
    createdPages.map(function (page) {
      return page.id;
    }),
  );
  const actions = pages.flatMap(function (page) {
    if (page.periodType !== period.type) {
      return [];
    }

    const canLock = shouldLockPeriodPage(
      period,
      page,
      pages,
      findHeadingTitles(transfer.destinations, page.id),
      now,
    );
    const action = decidePeriodPageAction(period, page, now, canLock);
    return action.type === PAGE_ACTION_TYPE.none ? [] : [{ page, action }];
  });
  const finalized = await maintenance.finalize({
    pages,
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
