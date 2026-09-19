import type { CalendarMonth } from "./calendar-month";
import type { IsoWeek } from "./iso-week";

// 状態・種別は snake_case の文字列で表し、本番コードではこの定数を参照する。
export const PERIOD_TYPE = {
  weekly: "weekly",
  monthly: "monthly",
} as const;
export type PeriodType = (typeof PERIOD_TYPE)[keyof typeof PERIOD_TYPE];

export const PAGE_KIND = {
  ...PERIOD_TYPE,
  daily: "daily",
  memo: "memo",
} as const;
export type PageKind = (typeof PAGE_KIND)[keyof typeof PAGE_KIND];

// Notion から読んだままの 1 ページ。periodType は type select（Weekly / Monthly）に対応し、無ければ null。
export interface NotionPage {
  readonly id: string;
  readonly createdTime: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly periodType: PeriodType | null;
}

// 分類済みのページ。日付や期間はタイトルから一度だけ確定し、以降の判断はこの値だけを使う。
export interface DailyPage {
  readonly id: string;
  readonly createdTime: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly dateKey: string;
}

export interface PeriodPage<K> {
  readonly id: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly key: K;
}

export type WeeklyPage = PeriodPage<IsoWeek>;
export type MonthlyPage = PeriodPage<CalendarMonth>;

// 日誌データベースの全ページを種別ごとに分けたもの。メモはどの処理も触らないので含めない。
export interface DiaryPages {
  readonly dailies: readonly DailyPage[];
  readonly weeklies: readonly WeeklyPage[];
  readonly monthlies: readonly MonthlyPage[];
}
