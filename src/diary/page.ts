import { parseDailyTitleDateKey } from "./daily-title";
import { getJstDateKey, parseCreatedTime } from "./jst-date";

export type PeriodType = "weekly" | "monthly";

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
  | { readonly kind: "weekly" }
  | { readonly kind: "monthly" }
  | { readonly kind: "daily"; readonly dateKey: string }
  | { readonly kind: "memo" };

export function classifyPage(page: PageIdentity, now: Date): PageClassification {
  if (page.periodType !== null) {
    return { kind: page.periodType };
  }

  const titleDateKey = parseDailyTitleDateKey(page.title);

  if (titleDateKey !== null) {
    return { kind: "daily", dateKey: titleDateKey };
  }

  // 空でない非日付タイトルまで作成日で補完するとユーザーのメモを上書きするため、今日候補への救済は空タイトルだけに限る。
  if (page.title !== "") {
    return { kind: "memo" };
  }

  const todayKey = getJstDateKey(now);

  if (getJstDateKey(parseCreatedTime(page.createdTime)) === todayKey) {
    return { kind: "daily", dateKey: todayKey };
  }

  return { kind: "memo" };
}

export function getDailyDateKey(page: PageIdentity, now: Date): string | null {
  const classification = classifyPage(page, now);
  return classification.kind === "daily" ? classification.dateKey : null;
}
