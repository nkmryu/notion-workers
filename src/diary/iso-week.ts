import { getJstCalendarDate, resolveShortYear } from "./jst-date";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKLY_TITLE_PATTERN = /^(\d{2})\.W(\d{2})$/;

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
  if (left.year !== right.year) {
    return left.year < right.year ? -1 : 1;
  }

  if (left.week === right.week) {
    return 0;
  }

  return left.week < right.week ? -1 : 1;
}

export function formatIsoWeekTitle({ year, week }: IsoWeek): string {
  const shortYear = (year % 100).toString().padStart(2, "0");
  const paddedWeek = week.toString().padStart(2, "0");

  return `${shortYear}.W${paddedWeek}`;
}

function getIsoWeeksInYear(year: number): number {
  return getJstIsoWeek(new Date(Date.UTC(year, 11, 28, 3))).week;
}

export function parseIsoWeekTitle(
  title: string,
  referenceYear: number,
): IsoWeek | null {
  const match = WEEKLY_TITLE_PATTERN.exec(title);
  const [, shortYearText, weekText] = match ?? [];

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
