import type { IsoWeek } from "./iso-week";
import type { PageAction, PageState } from "./page-action";

import { getJstDateKey } from "./date";
import {
  compareIsoWeeks,
  formatIsoWeekTitle,
  getJstIsoWeek,
} from "./iso-week";
import {
  classifyPage,
  dateKeyToDate,
  formatDailyTitleFromDateKey,
} from "./page-classification";

const WEEKLY_TITLE_PATTERN = /^(\d{2})\.W(\d{2})$/;

export interface WeeklyPageActionContext {
  readonly currentWeek: IsoWeek;
}

export interface WeeklyPageForCreation {
  readonly createdTime: string;
  readonly isWeekly: boolean;
  readonly currentTitle: string;
  readonly isMonthly?: boolean;
}

export interface WeeklyDailyPage {
  readonly createdTime: string;
  readonly currentTitle: string;
  readonly isWeekly: boolean;
  readonly isMonthly?: boolean;
}

export interface WeeklyCreationPlan {
  readonly week: IsoWeek;
  readonly title: string;
  readonly representativeCreatedTime: string;
}

function parseCreatedTime(createdTime: string): Date {
  const createdAt = new Date(createdTime);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`created_time が不正です: ${createdTime}`);
  }

  return createdAt;
}

export function createWeeklyPageActionContext(
  now: Date,
): WeeklyPageActionContext {
  return { currentWeek: getJstIsoWeek(now) };
}

function getIsoWeeksInYear(year: number): number {
  return getJstIsoWeek(new Date(Date.UTC(year, 11, 28, 3))).week;
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

function parseWeeklyTitle(title: string, referenceYear: number): IsoWeek | null {
  const match = WEEKLY_TITLE_PATTERN.exec(title);

  if (match === null) {
    return null;
  }

  const shortYearText = match[1];
  const weekText = match[2];

  if (shortYearText === undefined || weekText === undefined) {
    return null;
  }

  const year = resolveShortYear(Number(shortYearText), referenceYear);
  const week = Number(weekText);

  if (week < 1 || week > getIsoWeeksInYear(year)) {
    return null;
  }

  return { year, week };
}

export function getWeeklyPageWeek(
  page: Pick<WeeklyPageForCreation, "createdTime" | "currentTitle">,
): IsoWeek {
  const createdAt = parseCreatedTime(page.createdTime);
  const createdWeek = getJstIsoWeek(createdAt);
  return parseWeeklyTitle(page.currentTitle, createdWeek.year) ?? createdWeek;
}

export function decideWeeklyPageActionWithContext(
  page: PageState,
  context: WeeklyPageActionContext,
  canLock = false,
): PageAction {
  if (page.isWeekly === false) {
    return { type: "none" };
  }

  const pageWeek = getWeeklyPageWeek(page);
  const comparison = compareIsoWeeks(pageWeek, context.currentWeek);

  if (comparison === 1) {
    return { type: "none" };
  }

  const expectedTitle = formatIsoWeekTitle(pageWeek);

  if (page.currentTitle !== expectedTitle) {
    return { type: "rename", title: expectedTitle };
  }

  if (comparison === -1 && page.isLocked === false && canLock) {
    return { type: "lock" };
  }

  return { type: "none" };
}

export function decideWeeklyPageAction(
  page: PageState,
  now: Date,
  canLock = false,
): PageAction {
  return decideWeeklyPageActionWithContext(
    page,
    createWeeklyPageActionContext(now),
    canLock,
  );
}

function sameIsoWeek(left: IsoWeek, right: IsoWeek): boolean {
  return compareIsoWeeks(left, right) === 0;
}

export function planMissingWeeklyPages(
  pages: readonly WeeklyPageForCreation[],
  now: Date,
): readonly WeeklyCreationPlan[] {
  const dailyWeeks = pages
    .reduce<readonly WeeklyCreationPlan[]>(function (plans, page) {
      const classification = classifyPage(page, now);

      if (classification.kind !== "daily") {
        return plans;
      }

      const representativeDate = dateKeyToDate(classification.dateKey);
      const week = getJstIsoWeek(representativeDate);
      const exists = plans.some(function (plan) {
        return sameIsoWeek(plan.week, week);
      });

      if (exists) {
        return plans;
      }

      return [
        ...plans,
        {
          week,
          title: formatIsoWeekTitle(week),
          representativeCreatedTime: representativeDate.toISOString(),
        },
      ];
    }, [])
    .toSorted(function (left, right) {
      return compareIsoWeeks(left.week, right.week);
    });
  const weeklyWeeks = pages
    .filter(function (page) {
      return page.isWeekly;
    })
    .map(getWeeklyPageWeek);

  return dailyWeeks.filter(function (plan) {
    return weeklyWeeks.some(function (week) {
      return sameIsoWeek(week, plan.week);
    }) === false;
  });
}

export function shouldLockWeeklyPage(
  weekly: PageState,
  pages: readonly WeeklyDailyPage[],
  headingTitles: readonly string[],
  now: Date,
): boolean {
  if (weekly.isWeekly === false || weekly.isLocked) {
    return false;
  }

  const weeklyWeek = getWeeklyPageWeek(weekly);

  if (compareIsoWeeks(weeklyWeek, getJstIsoWeek(now)) !== -1) {
    return false;
  }

  const todayKey = getJstDateKey(now);
  const expectedTitles = pages.flatMap<string>(function (page) {
    const classification = classifyPage(page, now);

    if (
      classification.kind !== "daily" ||
      classification.dateKey >= todayKey
    ) {
      return [];
    }

    const dailyDate = dateKeyToDate(classification.dateKey);

    if (sameIsoWeek(getJstIsoWeek(dailyDate), weeklyWeek) === false) {
      return [];
    }

    return [formatDailyTitleFromDateKey(classification.dateKey)];
  });

  return expectedTitles.every(function (title) {
    return headingTitles.includes(title);
  });
}
