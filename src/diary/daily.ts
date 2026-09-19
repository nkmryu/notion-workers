import type { DailyPage } from "./page";

import { Temporal } from "temporal-polyfill";

import { parseCreatedTime } from "./jst";

// Temporal の dayOfWeek は月曜 = 1 … 日曜 = 7。
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
const DAILY_TITLE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{2})（[日月火水木金土]）$/;

export function formatDailyTitle(date: Temporal.PlainDate): string {
  const weekday = WEEKDAYS[date.dayOfWeek - 1];

  if (weekday === undefined) {
    throw new Error(`曜日の変換に失敗しました: ${date.toString()}`);
  }

  const shortYear = (date.year % 100).toString().padStart(2, "0");
  const month = date.month.toString().padStart(2, "0");
  const day = date.day.toString().padStart(2, "0");

  return `${shortYear}.${month}.${day}（${weekday}）`;
}

// 曜日文字は日付の同定に使わない。年・月・日だけで日付を決め、存在しない日付は失敗させる。
export function parseDailyTitle(title: string): Temporal.PlainDate | null {
  const [, yearText, monthText, dayText] = DAILY_TITLE_PATTERN.exec(title) ?? [];

  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    return null;
  }

  try {
    return Temporal.PlainDate.from(
      { year: 2000 + Number(yearText), month: Number(monthText), day: Number(dayText) },
      { overflow: "reject" },
    );
  } catch {
    throw new Error(`日付が不正です: ${title}`);
  }
}

// Daily の日付は、タイトルが読めればタイトルから、空タイトル（テンプレート適用中）なら作成日から決める。
// 日付でも空でもないタイトルの Daily はデータ不整合なので失敗させる。
export function resolveDailyDate(page: {
  readonly title: string;
  readonly createdTime: string;
}): Temporal.PlainDate {
  const titleDate = parseDailyTitle(page.title);

  if (titleDate !== null) {
    return titleDate;
  }

  if (page.title === "") {
    return parseCreatedTime(page.createdTime);
  }

  throw new Error(`Daily のタイトルが日付形式ではありません: ${page.title}`);
}

export const PAGE_ACTION_TYPE = {
  rename: "rename",
  lock: "lock",
  none: "none",
} as const;

export type PageAction =
  | { readonly type: typeof PAGE_ACTION_TYPE.rename; readonly title: string }
  | { readonly type: typeof PAGE_ACTION_TYPE.lock }
  | { readonly type: typeof PAGE_ACTION_TYPE.none };

export function shouldCreateTodayPage(
  dailies: readonly Pick<DailyPage, "date">[],
  today: Temporal.PlainDate,
): boolean {
  return !dailies.some(function (daily) {
    return daily.date.equals(today);
  });
}

export function decideDailyPageAction(
  page: Pick<DailyPage, "date" | "title" | "isLocked">,
  today: Temporal.PlainDate,
): PageAction {
  const expectedTitle = formatDailyTitle(page.date);

  if (page.date.equals(today)) {
    return page.title === expectedTitle
      ? { type: PAGE_ACTION_TYPE.none }
      : { type: PAGE_ACTION_TYPE.rename, title: expectedTitle };
  }

  if (Temporal.PlainDate.compare(page.date, today) < 0 && !page.isLocked) {
    return { type: PAGE_ACTION_TYPE.lock };
  }

  return { type: PAGE_ACTION_TYPE.none };
}
