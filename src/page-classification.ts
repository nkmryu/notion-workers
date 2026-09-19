import { formatDailyTitle, getJstDateKey } from "./date";

const DAILY_TITLE_PATTERN =
  /^(\d{2})\.(\d{2})\.(\d{2})（[日月火水木金土]）$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ClassifiablePage {
  readonly createdTime: string;
  readonly currentTitle: string;
  readonly isWeekly: boolean;
  readonly isMonthly?: boolean;
}

export type PageClassification =
  | { readonly kind: "weekly" }
  | { readonly kind: "monthly" }
  | { readonly kind: "daily"; readonly dateKey: string }
  | { readonly kind: "memo" };

function calendarDateToDate(
  year: number,
  month: number,
  day: number,
  source: string,
): Date {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`日付が不正です: ${source}`);
  }

  return date;
}

export function parseDailyTitleDateKey(title: string): string | null {
  const match = DAILY_TITLE_PATTERN.exec(title);

  if (match === null) {
    return null;
  }

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];

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
  calendarDateToDate(year, month, day, title);

  return `${year.toString().padStart(4, "0")}-${monthText}-${dayText}`;
}

export function dateKeyToDate(dateKey: string): Date {
  const match = DATE_KEY_PATTERN.exec(dateKey);

  if (match === null) {
    throw new Error(`日付キーが不正です: ${dateKey}`);
  }

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];

  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined
  ) {
    throw new Error(`日付キーが不正です: ${dateKey}`);
  }

  return calendarDateToDate(
    Number(yearText),
    Number(monthText),
    Number(dayText),
    dateKey,
  );
}

export function formatDailyTitleFromDateKey(dateKey: string): string {
  return formatDailyTitle(dateKeyToDate(dateKey));
}

export function classifyPage(
  page: ClassifiablePage,
  now: Date,
): PageClassification {
  if (page.isWeekly) {
    return { kind: "weekly" };
  }

  if (page.isMonthly === true) {
    return { kind: "monthly" };
  }

  const titleDateKey = parseDailyTitleDateKey(page.currentTitle);

  if (titleDateKey !== null) {
    return { kind: "daily", dateKey: titleDateKey };
  }

  // 空でない非日付タイトルまで作成日で補完するとユーザーのメモを上書きするため、今日候補への救済は空タイトルだけに限る。
  if (page.currentTitle !== "") {
    return { kind: "memo" };
  }

  const createdAt = new Date(page.createdTime);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`created_time が不正です: ${page.createdTime}`);
  }

  const todayKey = getJstDateKey(now);

  if (getJstDateKey(createdAt) === todayKey) {
    return { kind: "daily", dateKey: todayKey };
  }

  return { kind: "memo" };
}
