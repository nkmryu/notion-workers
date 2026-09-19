import type { DailyPage } from "./daily";
import type { PeriodArchive, TransferState } from "./period";

import { Temporal } from "temporal-polyfill";

import { parseDailyTitle } from "./daily";
import { REFS_HEADING_TITLE } from "./refs";

// 1 日分を 1 つの転記先へ書く計画。heading は転記先に立てる日付見出しで、転記済み判定の冪等キーになる。
export interface TransferPlan {
  readonly destinationPageId: string;
  readonly date: Temporal.PlainDate;
  readonly heading: string;
  readonly dailyPageIds: readonly string[];
}

// 転記状態は期間ページ直下の見出しから読む。日付形式の見出しが転記済みの日、Refs 見出しが Refs の有無を表す。
export function deriveTransferState(sectionTitles: readonly string[]): TransferState {
  return {
    transferredDates: sectionTitles.flatMap(function (title) {
      const date = parseDailyTitle(title);
      return date === null ? [] : [date];
    }),
    hasRefs: sectionTitles.includes(REFS_HEADING_TITLE),
  };
}

// 同じ日付の Daily が複数あるときは created_time 順に 1 つの見出しの下へ並べる。
function compareDailies(left: DailyPage, right: DailyPage): number {
  const dateComparison = Temporal.PlainDate.compare(left.date, right.date);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  const timeComparison = Temporal.Instant.compare(left.createdAt, right.createdAt);

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
        destinationPageId: destination.id,
        date: daily.date,
        heading: daily.expectedTitle,
        dailyPageIds: [],
      },
      daily.id,
    );
  }, []);
}
