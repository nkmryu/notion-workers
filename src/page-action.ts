import { getJstDateKey } from "./date";
import {
  classifyPage,
  formatDailyTitleFromDateKey,
} from "./page-classification";

export interface PageState {
  readonly createdTime: string;
  readonly isLocked: boolean;
  readonly currentTitle: string;
  readonly isWeekly: boolean;
  readonly isMonthly?: boolean;
}

export type PageAction =
  | { readonly type: "rename"; readonly title: string }
  | { readonly type: "lock" }
  | { readonly type: "none" };

export interface PageActionContext {
  readonly now: Date;
  readonly todayKey: string;
}

export function createPageActionContext(now: Date): PageActionContext {
  return {
    now,
    todayKey: getJstDateKey(now),
  };
}

export function decidePageActionWithContext(
  page: PageState,
  context: PageActionContext,
): PageAction {
  const classification = classifyPage(page, context.now);

  if (classification.kind !== "daily") {
    return { type: "none" };
  }

  const expectedTitle = formatDailyTitleFromDateKey(classification.dateKey);

  if (classification.dateKey === context.todayKey) {
    if (page.currentTitle === expectedTitle) {
      return { type: "none" };
    }

    return { type: "rename", title: expectedTitle };
  }

  if (classification.dateKey < context.todayKey && page.isLocked === false) {
    return { type: "lock" };
  }

  return { type: "none" };
}

export function decidePageAction(page: PageState, now: Date): PageAction {
  return decidePageActionWithContext(page, createPageActionContext(now));
}
