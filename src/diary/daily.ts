import type { DateKey } from "./jst-date";
import type { DailyPage } from "./page";

import { formatDailyTitleFromDateKey } from "./daily-title";
import { getJstDateKey } from "./jst-date";

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
  dailies: readonly Pick<DailyPage, "dateKey">[],
  now: Date,
): boolean {
  const todayKey = getJstDateKey(now);

  return !dailies.some(function (daily) {
    return daily.dateKey === todayKey;
  });
}

export function decideDailyPageAction(
  page: Pick<DailyPage, "dateKey" | "title" | "isLocked">,
  now: Date,
): PageAction {
  const todayKey = getJstDateKey(now);
  const expectedTitle = formatDailyTitleFromDateKey(page.dateKey);

  if (page.dateKey === todayKey) {
    return page.title === expectedTitle
      ? { type: PAGE_ACTION_TYPE.none }
      : { type: PAGE_ACTION_TYPE.rename, title: expectedTitle };
  }

  if (page.dateKey < todayKey && !page.isLocked) {
    return { type: PAGE_ACTION_TYPE.lock };
  }

  return { type: PAGE_ACTION_TYPE.none };
}
