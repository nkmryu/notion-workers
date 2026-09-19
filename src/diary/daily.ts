import type { LockablePage, PageIdentity } from "./page";

import { formatDailyTitleFromDateKey } from "./daily-title";
import { getJstDateKey } from "./jst-date";
import { getDailyDateKey } from "./page";

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
    return { type: PAGE_ACTION_TYPE.none };
  }

  const todayKey = getJstDateKey(now);
  const expectedTitle = formatDailyTitleFromDateKey(dateKey);

  if (dateKey === todayKey) {
    return page.title === expectedTitle
      ? { type: PAGE_ACTION_TYPE.none }
      : { type: PAGE_ACTION_TYPE.rename, title: expectedTitle };
  }

  if (dateKey < todayKey && !page.isLocked) {
    return { type: PAGE_ACTION_TYPE.lock };
  }

  return { type: PAGE_ACTION_TYPE.none };
}
