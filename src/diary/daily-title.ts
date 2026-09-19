import { calendarDateToUtcDate, dateKeyToDate, getJstCalendarDate } from "./jst-date";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DAILY_TITLE_PATTERN =
  /^(\d{2})\.(\d{2})\.(\d{2})（[日月火水木金土]）$/;

export function formatDailyTitle(date: Date): string {
  const { year, month, day } = getJstCalendarDate(date);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = WEEKDAYS[weekdayIndex];

  if (weekday === undefined) {
    throw new Error(`曜日の変換に失敗しました: ${date.toISOString()}`);
  }

  const shortYear = (year % 100).toString().padStart(2, "0");
  const paddedMonth = month.toString().padStart(2, "0");
  const paddedDay = day.toString().padStart(2, "0");

  return `${shortYear}.${paddedMonth}.${paddedDay}（${weekday}）`;
}

export function formatDailyTitleFromDateKey(dateKey: string): string {
  return formatDailyTitle(dateKeyToDate(dateKey));
}

// 曜日文字は日付の同定に使わない。年・月・日だけで日付キーを決める。
export function parseDailyTitleDateKey(title: string): string | null {
  const match = DAILY_TITLE_PATTERN.exec(title);
  const [, yearText, monthText, dayText] = match ?? [];

  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined
  ) {
    return null;
  }

  const year = 2000 + Number(yearText);
  calendarDateToUtcDate(year, Number(monthText), Number(dayText), title);

  return `${year.toString().padStart(4, "0")}-${monthText}-${dayText}`;
}
