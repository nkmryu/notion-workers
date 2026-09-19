import type { DailyPage, PeriodPage, PeriodType } from "./page";
import type { PeriodDefinition } from "./period";

import { formatDailyTitleFromDateKey } from "./daily-title";
import { getJstDateKey, parseCreatedTime } from "./jst-date";
import { keyOfDateKey } from "./period";

// 転記先となる期間ページ。headingTitles は転記済み判定の冪等キー。
export interface TransferDestination<K> extends PeriodPage<K> {
  readonly headingTitles: readonly string[];
}

export interface TransferPlan {
  readonly periodType: PeriodType;
  readonly destinationPageId: string;
  readonly title: string;
  readonly dailyPageIds: readonly string[];
}

type EndedDaily = Pick<DailyPage, "id" | "createdTime" | "dateKey">;

// 同じ日付の Daily が複数あるときは created_time 順に 1 つの見出しの下へ並べる。
function compareDailies(left: EndedDaily, right: EndedDaily): number {
  const dateComparison = left.dateKey.localeCompare(right.dateKey);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  const timeComparison =
    parseCreatedTime(left.createdTime).getTime() -
    parseCreatedTime(right.createdTime).getTime();

  return timeComparison !== 0 ? timeComparison : left.id.localeCompare(right.id);
}

function listEndedDailies(
  dailies: readonly EndedDaily[],
  now: Date,
): readonly EndedDaily[] {
  const todayKey = getJstDateKey(now);

  // 今日の Daily は書きかけなので転記しない。
  return dailies
    .filter(function (daily) {
      return daily.dateKey < todayKey;
    })
    .toSorted(compareDailies);
}

function addToPlans(
  plans: readonly TransferPlan[],
  plan: TransferPlan,
  dailyId: string,
): readonly TransferPlan[] {
  const existing = plans.find(function (candidate) {
    return (
      candidate.destinationPageId === plan.destinationPageId &&
      candidate.title === plan.title
    );
  });

  if (existing === undefined) {
    return [...plans, { ...plan, dailyPageIds: [dailyId] }];
  }

  return plans.map(function (candidate) {
    return candidate === existing
      ? { ...candidate, dailyPageIds: [...candidate.dailyPageIds, dailyId] }
      : candidate;
  });
}

export function planTransfers<K>(
  period: PeriodDefinition<K>,
  dailies: readonly EndedDaily[],
  destinations: readonly TransferDestination<K>[],
  now: Date,
): readonly TransferPlan[] {
  return listEndedDailies(dailies, now).reduce<readonly TransferPlan[]>(function (
    plans,
    daily,
  ) {
    const dailyKey = keyOfDateKey(period, daily.dateKey);
    const destination = destinations.find(function (candidate) {
      return period.compare(candidate.key, dailyKey) === 0;
    });
    const title = formatDailyTitleFromDateKey(daily.dateKey);

    if (
      destination === undefined ||
      destination.isLocked ||
      destination.headingTitles.includes(title)
    ) {
      return plans;
    }

    return addToPlans(
      plans,
      { periodType: period.type, destinationPageId: destination.id, title, dailyPageIds: [] },
      daily.id,
    );
  }, []);
}
