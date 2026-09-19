import { Temporal } from "temporal-polyfill";

import type { DailyPage } from "./page";

import { formatDailyTitle } from "./daily-title";

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
  dailies: readonly Pick<DailyPage, "date">[],
  today: Temporal.PlainDate,
): boolean {
  return !dailies.some(function (daily) {
    return daily.date.equals(today);
  });
}

export function decideDailyPageAction(
  page: Pick<DailyPage, "date" | "title" | "isLocked">,
  today: Temporal.PlainDate,
): PageAction {
  const expectedTitle = formatDailyTitle(page.date);

  if (page.date.equals(today)) {
    return page.title === expectedTitle
      ? { type: PAGE_ACTION_TYPE.none }
      : { type: PAGE_ACTION_TYPE.rename, title: expectedTitle };
  }

  if (Temporal.PlainDate.compare(page.date, today) < 0 && !page.isLocked) {
    return { type: PAGE_ACTION_TYPE.lock };
  }

  return { type: PAGE_ACTION_TYPE.none };
}
