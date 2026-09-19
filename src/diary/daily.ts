import type { LockablePage, PageIdentity } from "./page";

import { formatDailyTitleFromDateKey } from "./daily-title";
import { getJstDateKey } from "./jst-date";
import { getDailyDateKey } from "./page";

export type PageAction =
  | { readonly type: "rename"; readonly title: string }
  | { readonly type: "lock" }
  | { readonly type: "none" };

export function shouldCreateTodayPage(
  pages: readonly PageIdentity[],
  now: Date,
): boolean {
  const todayKey = getJstDateKey(now);

  return !pages.some(function (page) {
    return getDailyDateKey(page, now) === todayKey;
  });
}

export function decideDailyPageAction(page: LockablePage, now: Date): PageAction {
  const dateKey = getDailyDateKey(page, now);

  if (dateKey === null) {
    return { type: "none" };
  }

  const todayKey = getJstDateKey(now);
  const expectedTitle = formatDailyTitleFromDateKey(dateKey);

  if (dateKey === todayKey) {
    return page.title === expectedTitle
      ? { type: "none" }
      : { type: "rename", title: expectedTitle };
  }

  if (dateKey < todayKey && !page.isLocked) {
    return { type: "lock" };
  }

  return { type: "none" };
}
