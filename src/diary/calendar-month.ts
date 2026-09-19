import { getJstCalendarDate, resolveShortYear } from "./jst-date";

const MONTHLY_TITLE_PATTERN = /^(\d{2})\.M(\d{2})$/;

export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

export function getJstCalendarMonth(date: Date): CalendarMonth {
  const { year, month } = getJstCalendarDate(date);
  return { year, month };
}

export function compareCalendarMonths(
  left: CalendarMonth,
  right: CalendarMonth,
): -1 | 0 | 1 {
  if (left.year !== right.year) {
    return left.year < right.year ? -1 : 1;
  }

  if (left.month === right.month) {
    return 0;
  }

  return left.month < right.month ? -1 : 1;
}

export function formatCalendarMonthTitle({ year, month }: CalendarMonth): string {
  return `${(year % 100).toString().padStart(2, "0")}.M${month
    .toString()
    .padStart(2, "0")}`;
}

export function parseCalendarMonthTitle(
  title: string,
  referenceYear: number,
): CalendarMonth | null {
  const match = MONTHLY_TITLE_PATTERN.exec(title);
  const [, shortYearText, monthText] = match ?? [];

  if (shortYearText === undefined || monthText === undefined) {
    return null;
  }

  const month = Number(monthText);

  if (month < 1 || month > 12) {
    return null;
  }

  return { year: resolveShortYear(Number(shortYearText), referenceYear), month };
}
