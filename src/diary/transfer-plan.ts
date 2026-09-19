import type { DiaryPage, PeriodType } from "./page";
import type { PeriodDefinition } from "./period";

import { formatDailyTitleFromDateKey } from "./daily-title";
import { getJstDateKey, parseCreatedTime } from "./jst-date";
import { getDailyDateKey } from "./page";
import { keyOfDateKey } from "./period";

// 転記先となる期間ページ。headingTitles は転記済み判定の冪等キー。
export interface TransferDestination<K> {
  readonly id: string;
  readonly key: K;
  readonly isLocked: boolean;
  readonly headingTitles: readonly string[];
}

export interface TransferPlan {
  readonly periodType: PeriodType;
  readonly destinationPageId: string;
  readonly title: string;
  readonly dailyPageIds: readonly string[];
}

interface EndedDaily {
  readonly id: string;
  readonly createdTime: string;
  readonly dateKey: string;
}

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
  pages: readonly Pick<DiaryPage, "id" | "createdTime" | "title" | "periodType">[],
  now: Date,
): readonly EndedDaily[] {
  const todayKey = getJstDateKey(now);

  return pages
    .flatMap<EndedDaily>(function (page) {
      const dateKey = getDailyDateKey(page, now);

      // 今日の Daily は書きかけなので転記しない。
      if (dateKey === null || dateKey >= todayKey) {
        return [];
      }

      return [{ id: page.id, createdTime: page.createdTime, dateKey }];
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
  pages: readonly Pick<DiaryPage, "id" | "createdTime" | "title" | "periodType">[],
  destinations: readonly TransferDestination<K>[],
  now: Date,
): readonly TransferPlan[] {
  return listEndedDailies(pages, now).reduce<readonly TransferPlan[]>(function (
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
      {
        periodType: period.type,
        destinationPageId: destination.id,
        title,
        dailyPageIds: [],
      },
      daily.id,
    );
  }, []);
}
