import type { DailyPage } from "./daily";
import type { PeriodType } from "./page";
import type { PeriodArchive } from "./period";

import { Temporal } from "temporal-polyfill";

export interface TransferPlan {
  readonly periodType: PeriodType;
  readonly destinationPageId: string;
  readonly date: Temporal.PlainDate;
  readonly title: string;
  readonly dailyPageIds: readonly string[];
}


// 同じ日付の Daily が複数あるときは created_time 順に 1 つの見出しの下へ並べる。
function compareDailies(left: DailyPage, right: DailyPage): number {
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
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): readonly DailyPage[] {
  return dailies
    .filter(function (daily) {
      return daily.isEnded(today);
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
  dailies: readonly DailyPage[],
  destinations: readonly PeriodArchive<K>[],
  today: Temporal.PlainDate,
): readonly TransferPlan[] {
  return listEndedDailies(dailies, today).reduce<readonly TransferPlan[]>(function (
    plans,
    daily,
  ) {
    const destination = destinations.find(function (candidate) {
      return candidate.contains(daily.date);
    });

    if (
      destination === undefined ||
      destination.isLocked ||
      destination.isTransferred(daily.date)
    ) {
      return plans;
    }

    return addToPlans(
      plans,
      {
        periodType: destination.period.type,
        destinationPageId: destination.id,
        date: daily.date,
        title: daily.expectedTitle,
        dailyPageIds: [],
      },
      daily.id,
    );
  }, []);
}
