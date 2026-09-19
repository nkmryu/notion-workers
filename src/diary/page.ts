import { parseDailyTitleDateKey } from "./daily-title";
import { getJstDateKey, parseCreatedTime } from "./jst-date";

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

// 日誌データベースの 1 ページ。periodType は Notion の type select（Weekly / Monthly）に対応し、無ければ null。
export interface DiaryPage {
  readonly id: string;
  readonly createdTime: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly periodType: PeriodType | null;
}

// 分類・計画の純粋関数は、判定に使う項目だけを受け取る。
export type PageIdentity = Pick<DiaryPage, "createdTime" | "title" | "periodType">;
export type LockablePage = PageIdentity & Pick<DiaryPage, "isLocked">;

export type PageClassification =
  | { readonly kind: PeriodType }
  | { readonly kind: typeof PAGE_KIND.daily; readonly dateKey: string }
  | { readonly kind: typeof PAGE_KIND.memo };

export function classifyPage(page: PageIdentity, now: Date): PageClassification {
  if (page.periodType !== null) {
    return { kind: page.periodType };
  }

  const titleDateKey = parseDailyTitleDateKey(page.title);

  if (titleDateKey !== null) {
    return { kind: PAGE_KIND.daily, dateKey: titleDateKey };
  }

  // 空でない非日付タイトルまで作成日で補完するとユーザーのメモを上書きするため、今日候補への救済は空タイトルだけに限る。
  if (page.title !== "") {
    return { kind: PAGE_KIND.memo };
  }

  const todayKey = getJstDateKey(now);

  if (getJstDateKey(parseCreatedTime(page.createdTime)) === todayKey) {
    return { kind: PAGE_KIND.daily, dateKey: todayKey };
  }

  return { kind: PAGE_KIND.memo };
}

export function getDailyDateKey(page: PageIdentity, now: Date): string | null {
  const classification = classifyPage(page, now);
  return classification.kind === PAGE_KIND.daily ? classification.dateKey : null;
}
