import type { PageAction } from "./page";

import { Temporal } from "temporal-polyfill";

import { parseCreatedTime } from "./jst";
import { PAGE_ACTION_TYPE } from "./page";

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

// 永続化されている Daily の姿。エンティティはここから生成し、日付はタイトルから導出する。
export interface DailyRecord {
  readonly id: string;
  readonly createdTime: string;
  readonly title: string;
  readonly isLocked: boolean;
}

// 日付は、タイトルが読めればタイトルから、空タイトル（テンプレート適用中）なら作成日から決める。
// 日付でも空でもないタイトルの Daily はデータ不整合なので失敗させる。
function resolveDailyDate(record: DailyRecord): Temporal.PlainDate {
  const titleDate = parseDailyTitle(record.title);

  if (titleDate !== null) {
    return titleDate;
  }

  if (record.title === "") {
    return parseCreatedTime(record.createdTime);
  }

  throw new Error(`Daily のタイトルが日付形式ではありません: ${record.title}`);
}

// 日誌の 1 日分。日付（JST の暦日）は生成時にタイトルから一度だけ確定し、以降の判断はこの値だけを使う。
export class DailyPage {
  private constructor(
    readonly id: string,
    readonly createdAt: Temporal.Instant,
    readonly title: string,
    readonly isLocked: boolean,
    readonly date: Temporal.PlainDate,
  ) {}

  static fromRecord(record: DailyRecord): DailyPage {
    return new DailyPage(
      record.id,
      Temporal.Instant.from(record.createdTime),
      record.title,
      record.isLocked,
      resolveDailyDate(record),
    );
  }

  get expectedTitle(): string {
    return formatDailyTitle(this.date);
  }

  isOn(date: Temporal.PlainDate): boolean {
    return this.date.equals(date);
  }

  // 今日より前の日は書き終えている。今日の分は書きかけなので転記もロックもしない。
  isEnded(today: Temporal.PlainDate): boolean {
    return Temporal.PlainDate.compare(this.date, today) < 0;
  }

  // 今日の分はタイトルを整え、終了した日は閉じる。操作は順に適用する。
  decideActions(today: Temporal.PlainDate): readonly PageAction[] {
    if (this.isOn(today)) {
      return this.title === this.expectedTitle
        ? []
        : [{ type: PAGE_ACTION_TYPE.rename, title: this.expectedTitle }];
    }

    return this.isEnded(today) && !this.isLocked ? [{ type: PAGE_ACTION_TYPE.lock }] : [];
  }
}

export function shouldCreateTodayPage(
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): boolean {
  return !dailies.some(function (daily) {
    return daily.isOn(today);
  });
}
