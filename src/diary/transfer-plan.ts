import type { DailyPage, PeriodArchive, PeriodType } from "./page";
import type { PeriodDefinition } from "./period";

import { Temporal } from "temporal-polyfill";

import { formatDailyTitle } from "./daily-title";
import { isTransferred } from "./period";

export interface TransferPlan {
  readonly periodType: PeriodType;
  readonly destinationPageId: string;
  readonly date: Temporal.PlainDate;
  readonly title: string;
  readonly dailyPageIds: readonly string[];
}

type EndedDaily = Pick<DailyPage, "id" | "createdTime" | "date">;

// 同じ日付の Daily が複数あるときは created_time 順に 1 つの見出しの下へ並べる。
function compareDailies(left: EndedDaily, right: EndedDaily): number {
  const dateComparison = Temporal.PlainDate.compare(left.date, right.date);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  const timeComparison = Temporal.Instant.compare(
    Temporal.Instant.from(left.createdTime),
    Temporal.Instant.from(right.createdTime),
  );

  return timeComparison !== 0 ? timeComparison : left.id.localeCompare(right.id);
}

function listEndedDailies(
  dailies: readonly EndedDaily[],
  today: Temporal.PlainDate,
): readonly EndedDaily[] {
  // 今日の Daily は書きかけなので転記しない。
  return dailies
    .filter(function (daily) {
      return Temporal.PlainDate.compare(daily.date, today) < 0;
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
      candidate.date.equals(plan.date)
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
  destinations: readonly Pick<PeriodArchive<K>, "id" | "key" | "isLocked" | "transferredDates">[],
  today: Temporal.PlainDate,
): readonly TransferPlan[] {
  return listEndedDailies(dailies, today).reduce<readonly TransferPlan[]>(function (
    plans,
    daily,
  ) {
    const dailyKey = period.keyOf(daily.date);
    const destination = destinations.find(function (candidate) {
      return period.compare(candidate.key, dailyKey) === 0;
    });
    if (
      destination === undefined ||
      destination.isLocked ||
      isTransferred(destination, daily.date)
    ) {
      return plans;
    }

    return addToPlans(
      plans,
      {
        periodType: period.type,
        destinationPageId: destination.id,
        date: daily.date,
        title: formatDailyTitle(daily.date),
        dailyPageIds: [],
      },
      daily.id,
    );
  }, []);
}
