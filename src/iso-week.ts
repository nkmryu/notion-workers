import { getJstCalendarDate } from "./date";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IsoWeek {
  readonly year: number;
  readonly week: number;
}

export function getJstIsoWeek(date: Date): IsoWeek {
  const { year, month, day } = getJstCalendarDate(date);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = calendarDate.getUTCDay() || 7;
  const thursday = new Date(calendarDate);
  thursday.setUTCDate(calendarDate.getUTCDate() + 4 - isoWeekday);

  const weekYear = thursday.getUTCFullYear();
  const firstDayOfWeekYear = Date.UTC(weekYear, 0, 1);
  const daysFromYearStart =
    (thursday.getTime() - firstDayOfWeekYear) / MILLISECONDS_PER_DAY;
  const week = Math.ceil((daysFromYearStart + 1) / 7);

  return { year: weekYear, week };
}

export function compareIsoWeeks(left: IsoWeek, right: IsoWeek): -1 | 0 | 1 {
  if (left.year < right.year) {
    return -1;
  }

  if (left.year > right.year) {
    return 1;
  }

  if (left.week < right.week) {
    return -1;
  }

  if (left.week > right.week) {
    return 1;
  }

  return 0;
}

export function formatWeeklyTitle(date: Date): string {
  return formatIsoWeekTitle(getJstIsoWeek(date));
}

export function formatIsoWeekTitle({ year, week }: IsoWeek): string {
  const shortYear = (year % 100).toString().padStart(2, "0");
  const paddedWeek = week.toString().padStart(2, "0");

  return `${shortYear}.W${paddedWeek}`;
}
