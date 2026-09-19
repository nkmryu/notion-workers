import type { PeriodDefinition, PeriodPage } from "./period";

import { Temporal } from "temporal-polyfill";

import { PERIOD_TYPE } from "./page";
import { resolveShortYear } from "./period";

const MONTHLY_TITLE_PATTERN = /^(\d{2})\.M(\d{2})$/;

export function formatCalendarMonthTitle(month: Temporal.PlainYearMonth): string {
  return `${(month.year % 100).toString().padStart(2, "0")}.M${month.month
    .toString()
    .padStart(2, "0")}`;
}

export function parseCalendarMonthTitle(
  title: string,
  referenceYear: number,
): Temporal.PlainYearMonth | null {
  const [, shortYearText, monthText] = MONTHLY_TITLE_PATTERN.exec(title) ?? [];

  if (shortYearText === undefined || monthText === undefined) {
    return null;
  }

  const month = Number(monthText);

  if (month < 1 || month > 12) {
    return null;
  }

  return Temporal.PlainYearMonth.from({
    year: resolveShortYear(Number(shortYearText), referenceYear),
    month,
  });
}

export type MonthlyPage = PeriodPage<Temporal.PlainYearMonth>;

export const monthly: PeriodDefinition<Temporal.PlainYearMonth> = {
  type: PERIOD_TYPE.monthly,
  hasBeforeLockStep: true,
  keyOf(date) {
    return date.toPlainYearMonth();
  },
  compare: Temporal.PlainYearMonth.compare,
  formatTitle: formatCalendarMonthTitle,
  parseTitle: parseCalendarMonthTitle,
  yearOf(month) {
    return month.year;
  },
};
