import type { PeriodDefinition } from "./period";

import { Temporal } from "temporal-polyfill";

import { PERIOD_TYPE } from "./page";
import { resolveShortYear } from "./period";

const WEEKLY_TITLE_PATTERN = /^(\d{2})\.W(\d{2})$/;

// ISO 週。年跨ぎの週は木曜が属する年（yearOfWeek）で数える。Temporal に週の型は無いので自前で持つ。
export interface IsoWeek {
  readonly year: number;
  readonly week: number;
}

export function isoWeekOf(date: Temporal.PlainDate): IsoWeek {
  return { year: date.yearOfWeek ?? date.year, week: date.weekOfYear ?? 1 };
}

export function compareIsoWeeks(left: IsoWeek, right: IsoWeek): number {
  return left.year !== right.year ? left.year - right.year : left.week - right.week;
}

export function formatIsoWeekTitle({ year, week }: IsoWeek): string {
  return `${(year % 100).toString().padStart(2, "0")}.W${week.toString().padStart(2, "0")}`;
}

function isoWeeksInYear(year: number): number {
  return isoWeekOf(Temporal.PlainDate.from({ year, month: 12, day: 28 })).week;
}

export function parseIsoWeekTitle(title: string, referenceYear: number): IsoWeek | null {
  const [, shortYearText, weekText] = WEEKLY_TITLE_PATTERN.exec(title) ?? [];

  if (shortYearText === undefined || weekText === undefined) {
    return null;
  }

  const year = resolveShortYear(Number(shortYearText), referenceYear);
  const week = Number(weekText);

  return week >= 1 && week <= isoWeeksInYear(year) ? { year, week } : null;
}

export const weekly: PeriodDefinition<IsoWeek> = {
  type: PERIOD_TYPE.weekly,
  hasBeforeLockStep: false,
  keyOf: isoWeekOf,
  compare: compareIsoWeeks,
  formatTitle: formatIsoWeekTitle,
  parseTitle: parseIsoWeekTitle,
  yearOf(week) {
    return week.year;
  },
};
