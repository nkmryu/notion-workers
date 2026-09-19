import type { PageAction, PageState } from "./page-action";

import { getJstCalendarDate, getJstDateKey } from "./date";
import {
  classifyPage,
  dateKeyToDate,
  formatDailyTitleFromDateKey,
} from "./page-classification";

const MONTHLY_TITLE_PATTERN = /^(\d{2})\.M(\d{2})$/;

export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

export interface MonthlyPageForCreation {
  readonly createdTime: string;
  readonly currentTitle: string;
  readonly isWeekly: boolean;
  readonly isMonthly?: boolean;
}

export interface MonthlyCreationPlan {
  readonly month: CalendarMonth;
  readonly title: string;
  readonly representativeCreatedTime: string;
}

export interface MonthlyPageActionContext {
  readonly currentMonth: CalendarMonth;
}

function parseCreatedTime(createdTime: string): Date {
  const createdAt = new Date(createdTime);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`created_time が不正です: ${createdTime}`);
  }

  return createdAt;
}

function resolveShortYear(shortYear: number, referenceYear: number): number {
  const century = Math.floor(referenceYear / 100) * 100;
  const candidates = [
    century - 100 + shortYear,
    century + shortYear,
    century + 100 + shortYear,
  ];

  return candidates.reduce(function (closest, candidate) {
    const closestDistance = Math.abs(closest - referenceYear);
    const candidateDistance = Math.abs(candidate - referenceYear);
    return candidateDistance < closestDistance ? candidate : closest;
  });
}

export function compareCalendarMonths(
  left: CalendarMonth,
  right: CalendarMonth,
): number {
  if (left.year !== right.year) {
    return left.year < right.year ? -1 : 1;
  }

  if (left.month === right.month) {
    return 0;
  }

  return left.month < right.month ? -1 : 1;
}

export function formatCalendarMonthTitle(month: CalendarMonth): string {
  return `${(month.year % 100).toString().padStart(2, "0")}.M${month.month
    .toString()
    .padStart(2, "0")}`;
}

export function getDateKeyCalendarMonth(dateKey: string): CalendarMonth {
  const date = dateKeyToDate(dateKey);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function parseMonthlyTitle(
  title: string,
  referenceYear: number,
): CalendarMonth | null {
  const match = MONTHLY_TITLE_PATTERN.exec(title);

  if (match === null) {
    return null;
  }

  const shortYearText = match[1];
  const monthText = match[2];

  if (shortYearText === undefined || monthText === undefined) {
    return null;
  }

  const month = Number(monthText);

  if (month < 1 || month > 12) {
    return null;
  }

  return {
    year: resolveShortYear(Number(shortYearText), referenceYear),
    month,
  };
}

export function getMonthlyPageMonth(
  page: Pick<MonthlyPageForCreation, "createdTime" | "currentTitle">,
): CalendarMonth {
  const createdAt = parseCreatedTime(page.createdTime);
  const createdDate = getJstCalendarDate(createdAt);
  const createdMonth = { year: createdDate.year, month: createdDate.month };
  return parseMonthlyTitle(page.currentTitle, createdMonth.year) ?? createdMonth;
}

export function createMonthlyPageActionContext(
  now: Date,
): MonthlyPageActionContext {
  const date = getJstCalendarDate(now);
  return { currentMonth: { year: date.year, month: date.month } };
}

export function decideMonthlyPageActionWithContext(
  page: PageState,
  context: MonthlyPageActionContext,
  canLock = false,
): PageAction {
  if (page.isMonthly !== true) {
    return { type: "none" };
  }

  const pageMonth = getMonthlyPageMonth(page);
  const comparison = compareCalendarMonths(pageMonth, context.currentMonth);

  if (comparison === 1) {
    return { type: "none" };
  }

  const expectedTitle = formatCalendarMonthTitle(pageMonth);

  if (page.currentTitle !== expectedTitle) {
    return { type: "rename", title: expectedTitle };
  }

  if (comparison === -1 && page.isLocked === false && canLock) {
    return { type: "lock" };
  }

  return { type: "none" };
}

export function decideMonthlyPageAction(
  page: PageState,
  now: Date,
  canLock = false,
): PageAction {
  return decideMonthlyPageActionWithContext(
    page,
    createMonthlyPageActionContext(now),
    canLock,
  );
}

function sameMonth(left: CalendarMonth, right: CalendarMonth): boolean {
  return compareCalendarMonths(left, right) === 0;
}

export function planMissingMonthlyPages(
  pages: readonly MonthlyPageForCreation[],
  now: Date,
): readonly MonthlyCreationPlan[] {
  const dailyMonths = pages
    .reduce<readonly MonthlyCreationPlan[]>(function (plans, page) {
      const classification = classifyPage(page, now);

      if (classification.kind !== "daily") {
        return plans;
      }

      const month = getDateKeyCalendarMonth(classification.dateKey);

      if (
        plans.some(function (plan) {
          return sameMonth(plan.month, month);
        })
      ) {
        return plans;
      }

      return [
        ...plans,
        {
          month,
          title: formatCalendarMonthTitle(month),
          representativeCreatedTime: dateKeyToDate(
            classification.dateKey,
          ).toISOString(),
        },
      ];
    }, [])
    .toSorted(function (left, right) {
      return compareCalendarMonths(left.month, right.month);
    });
  const existingMonths = pages
    .filter(function (page) {
      return page.isMonthly === true;
    })
    .map(getMonthlyPageMonth);

  return dailyMonths.filter(function (plan) {
    return existingMonths.some(function (month) {
      return sameMonth(month, plan.month);
    }) === false;
  });
}

export function shouldLockMonthlyPage(
  monthly: PageState,
  pages: readonly MonthlyPageForCreation[],
  headingTitles: readonly string[],
  now: Date,
): boolean {
  if (monthly.isMonthly !== true || monthly.isLocked) {
    return false;
  }

  const monthlyMonth = getMonthlyPageMonth(monthly);

  if (
    compareCalendarMonths(
      monthlyMonth,
      createMonthlyPageActionContext(now).currentMonth,
    ) !== -1
  ) {
    return false;
  }

  const todayKey = getJstDateKey(now);
  const expectedTitles = pages.flatMap<string>(function (page) {
    const classification = classifyPage(page, now);

    if (
      classification.kind !== "daily" ||
      classification.dateKey >= todayKey ||
      sameMonth(
        getDateKeyCalendarMonth(classification.dateKey),
        monthlyMonth,
      ) === false
    ) {
      return [];
    }

    return [formatDailyTitleFromDateKey(classification.dateKey)];
  });

  return expectedTitles.every(function (title) {
    return headingTitles.includes(title);
  });
}
