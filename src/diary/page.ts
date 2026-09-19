import type { CalendarMonth } from "./calendar-month";
import type { IsoWeek } from "./iso-week";
import type { DateKey } from "./jst-date";

// 状態・種別は snake_case の文字列で表し、本番コードではこの定数を参照する。
export const PERIOD_TYPE = {
  weekly: "weekly",
  monthly: "monthly",
} as const;
export type PeriodType = (typeof PERIOD_TYPE)[keyof typeof PERIOD_TYPE];

// 日誌の 1 日分。日付はタイトルから一度だけ確定し、以降の判断はこの値だけを使う。
export interface DailyPage {
  readonly id: string;
  readonly createdTime: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly dateKey: DateKey;
}

// 週・月のアーカイブページ。期間キー K はタイトルから一度だけ確定する。
export interface PeriodPage<K> {
  readonly id: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly key: K;
}

export type WeeklyPage = PeriodPage<IsoWeek>;
export type MonthlyPage = PeriodPage<CalendarMonth>;

// 期間ページに、その時点の転記状態（どの日を転記済みか・Refs があるか）を添えたもの。
// ロックと Refs の判断はこの状態だけで下せる。
export interface PeriodArchive<K> extends PeriodPage<K> {
  readonly transferredDateKeys: readonly DateKey[];
  readonly hasRefs: boolean;
}
