import type { CalendarMonth } from "../diary/calendar-month";
import type { Config } from "../config";
import type { PageAction } from "../diary/daily";
import type { IsoWeek } from "../diary/iso-week";
import type { DiaryPage } from "../diary/page";
import type { PeriodDefinition } from "../diary/period";
import type { TransferDestination } from "../diary/transfer-plan";
import type { NotionDiary } from "../notion/client";
import type { TransferResult } from "./transfer";

import { decideDailyPageAction } from "../diary/daily";
import { monthly } from "../diary/monthly";
import { decidePeriodPageAction, shouldLockPeriodPage } from "../diary/period";
import { weekly } from "../diary/weekly";
import { WRITE_INTERVAL_MS, sleep } from "../notion/pacing";
import { createMissingPages } from "./page-creation";
import { generateRefs } from "./refs";
import { transferEndedDailies } from "./transfer";

export interface MaintenanceSummary {
  readonly dailyCreated: number;
  readonly weekliesCreated: number;
  readonly monthliesCreated: number;
  readonly weeklyDaysTransferred: number;
  readonly weeklyFallbackDates: readonly string[];
  readonly monthlyDaysTransferred: number;
  readonly monthlyFallbackDates: readonly string[];
  readonly refsGenerated: number;
  readonly refsProcessed: number;
  readonly refTitlesResolved: number;
  readonly refAnchorTitles: number;
  readonly refTitleFallbacks: number;
  readonly renames: number;
  readonly locks: number;
}

interface PlannedAction {
  readonly page: DiaryPage;
  readonly action: Exclude<PageAction, { readonly type: "none" }>;
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

function decidePeriodAction<K>(
  period: PeriodDefinition<K>,
  page: DiaryPage,
  pages: readonly DiaryPage[],
  transfer: TransferResult<K>,
  now: Date,
): PageAction {
  const canLock = shouldLockPeriodPage(
    period,
    page,
    pages,
    findHeadingTitles(transfer.destinations, page.id),
    now,
  );

  return decidePeriodPageAction(period, page, now, canLock);
}

function decideAction(
  page: DiaryPage,
  pages: readonly DiaryPage[],
  weeklyTransfer: TransferResult<IsoWeek>,
  monthlyTransfer: TransferResult<CalendarMonth>,
  now: Date,
): PageAction {
  switch (page.periodType) {
    case "weekly":
      return decidePeriodAction(weekly, page, pages, weeklyTransfer, now);
    case "monthly":
      return decidePeriodAction(monthly, page, pages, monthlyTransfer, now);
    case null:
      return decideDailyPageAction(page, now);
  }
}

function planActions(
  pages: readonly DiaryPage[],
  weeklyTransfer: TransferResult<IsoWeek>,
  monthlyTransfer: TransferResult<CalendarMonth>,
  now: Date,
): readonly PlannedAction[] {
  return pages.flatMap<PlannedAction>(function (page) {
    const action = decideAction(page, pages, weeklyTransfer, monthlyTransfer, now);
    return action.type === "none" ? [] : [{ page, action }];
  });
}

async function applyActions(
  diary: NotionDiary,
  actions: readonly PlannedAction[],
): Promise<void> {
  const titleKey = actions.some(function ({ action }) {
    return action.type === "rename";
  })
    ? await diary.getTitleKey()
    : "";

  for (const { page, action } of actions) {
    if (action.type === "rename") {
      await diary.renamePage(page.id, titleKey, action.title);
    } else {
      await diary.lockPage(page.id);
    }

    await sleep(WRITE_INTERVAL_MS);
  }
}

function createdPageIds(
  pages: readonly DiaryPage[],
  periodType: DiaryPage["periodType"],
): readonly string[] {
  return pages.flatMap<string>(function (page) {
    return page.periodType === periodType ? [page.id] : [];
  });
}

// 1 回の実行で「ページ作成 → 転記 → Refs → リネーム・ロック」を順に行う。各段階は冪等で、途中で失敗しても次回が続きを処理する。
export async function runMaintenance(
  config: Config,
  now: Date,
): Promise<MaintenanceSummary> {
  const { diary } = config;
  const existingPages = await diary.listPages();
  const created = await createMissingPages(config, existingPages, now);
  const pages = [...existingPages, ...created.pages];
  const weeklyTransfer = await transferEndedDailies(
    diary,
    weekly,
    pages,
    now,
    createdPageIds(created.pages, "weekly"),
  );
  const monthlyTransfer = await transferEndedDailies(
    diary,
    monthly,
    pages,
    now,
    createdPageIds(created.pages, "monthly"),
  );
  const actions = planActions(pages, weeklyTransfer, monthlyTransfer, now);
  const lockPlannedMonthlyIds = actions.flatMap<string>(function ({ page, action }) {
    return action.type === "lock" && page.periodType === "monthly" ? [page.id] : [];
  });
  // Refs はロックの前に書く。ロック後に書けなくなることは無いが、閉じた月の内容を後から変えないため。
  const refs = await generateRefs(
    diary,
    pages,
    monthlyTransfer.destinations,
    lockPlannedMonthlyIds,
    now,
  );
  await applyActions(diary, actions);

  return {
    dailyCreated: created.dailyCreated,
    weekliesCreated: created.weekliesCreated,
    monthliesCreated: created.monthliesCreated,
    weeklyDaysTransferred: weeklyTransfer.daysTransferred,
    weeklyFallbackDates: weeklyTransfer.fallbackDates,
    monthlyDaysTransferred: monthlyTransfer.daysTransferred,
    monthlyFallbackDates: monthlyTransfer.fallbackDates,
    refsGenerated: refs.generated,
    refsProcessed: refs.processed,
    refTitlesResolved: refs.titleResolution.http,
    refAnchorTitles: refs.titleResolution.anchor,
    refTitleFallbacks: refs.titleResolution.fallback,
    renames: actions.filter(function ({ action }) {
      return action.type === "rename";
    }).length,
    locks: actions.filter(function ({ action }) {
      return action.type === "lock";
    }).length,
  };
}
