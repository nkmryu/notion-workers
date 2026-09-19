import type { Temporal } from "temporal-polyfill";

import type { IsoWeek } from "./weekly";

// 状態・種別は snake_case の文字列で表し、本番コードではこの定数を参照する。
export const PERIOD_TYPE = {
  weekly: "weekly",
  monthly: "monthly",
} as const;
export type PeriodType = (typeof PERIOD_TYPE)[keyof typeof PERIOD_TYPE];

// 日誌の 1 日分。日付（JST の暦日）はタイトルから一度だけ確定し、以降の判断はこの値だけを使う。
export interface DailyPage {
  readonly id: string;
  readonly createdTime: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly date: Temporal.PlainDate;
}

// 週・月のアーカイブページ。期間キー K はタイトルから一度だけ確定する。
export interface PeriodPage<K> {
  readonly id: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly key: K;
}

export type WeeklyPage = PeriodPage<IsoWeek>;
export type MonthlyPage = PeriodPage<Temporal.PlainYearMonth>;

// 期間ページに、その時点の転記状態（どの日を転記済みか・Refs があるか）を添えたもの。
// ロックと Refs の判断はこの状態だけで下せる。
export interface PeriodArchive<K> extends PeriodPage<K> {
  readonly transferredDates: readonly Temporal.PlainDate[];
  readonly hasRefs: boolean;
}
