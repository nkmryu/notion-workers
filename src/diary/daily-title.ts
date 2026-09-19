import type { DateKey } from "./jst-date";

import {
  calendarDateToUtcDate,
  dateKeyToDate,
  formatDateKey,
  getJstCalendarDate,
  getJstDateKey,
  parseCreatedTime,
} from "./jst-date";

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

export function formatDailyTitleFromDateKey(dateKey: DateKey): string {
  return formatDailyTitle(dateKeyToDate(dateKey));
}

// 曜日文字は日付の同定に使わない。年・月・日だけで日付キーを決める。
export function parseDailyTitleDateKey(title: string): DateKey | null {
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
  const month = Number(monthText);
  const day = Number(dayText);
  calendarDateToUtcDate(year, month, day, title);

  return formatDateKey({ year, month, day });
}

// Daily の日付は、タイトルが読めればタイトルから、空タイトル（テンプレート適用中）なら作成日から決める。
// 日付でも空でもないタイトルの Daily はデータ不整合なので失敗させる。
export function resolveDailyDateKey(page: {
  readonly title: string;
  readonly createdTime: string;
}): DateKey {
  const titleDateKey = parseDailyTitleDateKey(page.title);

  if (titleDateKey !== null) {
    return titleDateKey;
  }

  if (page.title === "") {
    return getJstDateKey(parseCreatedTime(page.createdTime));
  }

  throw new Error(`Daily のタイトルが日付形式ではありません: ${page.title}`);
}
