import type { IsoWeek } from "./iso-week";
import type { ClassifiablePage } from "./page-classification";
import type { CalendarMonth } from "./monthly-page";

import { getJstDateKey } from "./date";
import { compareIsoWeeks, getJstIsoWeek } from "./iso-week";
import {
  classifyPage,
  dateKeyToDate,
  formatDailyTitleFromDateKey,
} from "./page-classification";
import {
  compareCalendarMonths,
  getDateKeyCalendarMonth,
} from "./monthly-page";

export interface DailyTransferPage extends ClassifiablePage {
  readonly id: string;
}

export interface WeeklyTransferPage {
  readonly id: string;
  readonly week: IsoWeek;
  readonly isLocked: boolean;
  readonly headingTitles: readonly string[];
}

export interface MonthlyTransferPage {
  readonly id: string;
  readonly month: CalendarMonth;
  readonly isLocked: boolean;
  readonly headingTitles: readonly string[];
}

export interface DailyTransferPlan {
  readonly dailyPageIds: readonly string[];
  readonly weeklyPageId: string;
  readonly title: string;
}

export interface MonthlyDailyTransferPlan {
  readonly dailyPageIds: readonly string[];
  readonly monthlyPageId: string;
  readonly title: string;
}

interface ClassifiedDaily {
  readonly id: string;
  readonly createdTime: string;
  readonly dateKey: string;
}

function parseCreatedTime(createdTime: string): number {
  const timestamp = new Date(createdTime).getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error(`created_time が不正です: ${createdTime}`);
  }

  return timestamp;
}

function compareDailies(left: ClassifiedDaily, right: ClassifiedDaily): number {
  const dateComparison = left.dateKey.localeCompare(right.dateKey);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  const timeComparison =
    parseCreatedTime(left.createdTime) - parseCreatedTime(right.createdTime);

  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.id.localeCompare(right.id);
}

interface PeriodTransferPage {
  readonly id: string;
  readonly isLocked: boolean;
  readonly headingTitles: readonly string[];
  readonly containsDate: (dateKey: string) => boolean;
}

interface PeriodTransferPlan {
  readonly dailyPageIds: readonly string[];
  readonly periodPageId: string;
  readonly title: string;
}

function findTransferPlan(
  plans: readonly PeriodTransferPlan[],
  periodPageId: string,
  title: string,
): PeriodTransferPlan | undefined {
  return plans.find(function (plan) {
    return plan.periodPageId === periodPageId && plan.title === title;
  });
}

function planPeriodTransfers(
  pages: readonly DailyTransferPage[],
  periodPages: readonly PeriodTransferPage[],
  now: Date,
): readonly PeriodTransferPlan[] {
  const todayKey = getJstDateKey(now);
  const dailies = pages
    .flatMap<ClassifiedDaily>(function (page) {
      const classification = classifyPage(page, now);

      if (
        classification.kind !== "daily" ||
        classification.dateKey >= todayKey
      ) {
        return [];
      }

      return [
        {
          id: page.id,
          createdTime: page.createdTime,
          dateKey: classification.dateKey,
        },
      ];
    })
    .toSorted(compareDailies);

  const plans = dailies.reduce<readonly PeriodTransferPlan[]>(function (
    currentPlans,
    daily,
  ) {
    const periodPage = periodPages.find(function (candidate) {
      return candidate.containsDate(daily.dateKey);
    });

    if (periodPage === undefined || periodPage.isLocked) {
      return currentPlans;
    }

    const title = formatDailyTitleFromDateKey(daily.dateKey);

    if (periodPage.headingTitles.includes(title)) {
      return currentPlans;
    }

    const existingPlan = findTransferPlan(currentPlans, periodPage.id, title);

    if (existingPlan === undefined) {
      return [
        ...currentPlans,
        {
          dailyPageIds: [daily.id],
          periodPageId: periodPage.id,
          title,
        },
      ];
    }

    return currentPlans.map(function (plan) {
      if (plan !== existingPlan) {
        return plan;
      }

      return { ...plan, dailyPageIds: [...plan.dailyPageIds, daily.id] };
    });
  }, []);

  return plans;
}

export function planDailyTransfers(
  pages: readonly DailyTransferPage[],
  weeklies: readonly WeeklyTransferPage[],
  now: Date,
): readonly DailyTransferPlan[] {
  const periodPages = weeklies.map<PeriodTransferPage>(function (weekly) {
    return {
      id: weekly.id,
      isLocked: weekly.isLocked,
      headingTitles: weekly.headingTitles,
      containsDate(dateKey: string): boolean {
        return (
          compareIsoWeeks(
            weekly.week,
            getJstIsoWeek(dateKeyToDate(dateKey)),
          ) === 0
        );
      },
    };
  });

  return planPeriodTransfers(pages, periodPages, now).map(function (
    plan,
  ) {
    return {
      dailyPageIds: plan.dailyPageIds,
      weeklyPageId: plan.periodPageId,
      title: plan.title,
    };
  });
}

export function planMonthlyDailyTransfers(
  pages: readonly DailyTransferPage[],
  monthlies: readonly MonthlyTransferPage[],
  now: Date,
): readonly MonthlyDailyTransferPlan[] {
  const periodPages = monthlies.map<PeriodTransferPage>(function (monthly) {
    return {
      id: monthly.id,
      isLocked: monthly.isLocked,
      headingTitles: monthly.headingTitles,
      containsDate(dateKey: string): boolean {
        return (
          compareCalendarMonths(
            monthly.month,
            getDateKeyCalendarMonth(dateKey),
          ) === 0
        );
      },
    };
  });

  return planPeriodTransfers(pages, periodPages, now).map(function (
    plan,
  ) {
    return {
      dailyPageIds: plan.dailyPageIds,
      monthlyPageId: plan.periodPageId,
      title: plan.title,
    };
  });
}
