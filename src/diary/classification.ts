import type { DateKey } from "./jst-date";
import type {
  DailyPage,
  DiaryPages,
  NotionPage,
  PeriodPage,
  PeriodType,
} from "./page";
import type { PeriodDefinition } from "./period";

import { parseDailyTitleDateKey } from "./daily-title";
import { getJstDateKey, parseCreatedTime } from "./jst-date";
import { monthly } from "./monthly";
import { PAGE_KIND } from "./page";
import { weekly } from "./weekly";

export type PageClassification =
  | { readonly kind: PeriodType }
  | { readonly kind: typeof PAGE_KIND.daily; readonly dateKey: DateKey }
  | { readonly kind: typeof PAGE_KIND.memo };

export function classifyPage(
  page: Pick<NotionPage, "createdTime" | "title" | "periodType">,
  now: Date,
): PageClassification {
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

// 期間ページの期間は、タイトルが読めればタイトルから、読めなければ作成日から決める。
export function resolvePeriodKey<K>(
  period: PeriodDefinition<K>,
  page: Pick<NotionPage, "createdTime" | "title">,
): K {
  const createdKey = period.keyOfDate(parseCreatedTime(page.createdTime));
  return period.parseTitle(page.title, period.yearOf(createdKey)) ?? createdKey;
}

function toPeriodPage<K>(period: PeriodDefinition<K>, page: NotionPage): PeriodPage<K> {
  return {
    id: page.id,
    title: page.title,
    isLocked: page.isLocked,
    key: resolvePeriodKey(period, page),
  };
}

export function classifyPages(pages: readonly NotionPage[], now: Date): DiaryPages {
  return pages.reduce<DiaryPages>(
    function (groups, page) {
      const classification = classifyPage(page, now);

      switch (classification.kind) {
        case PAGE_KIND.daily: {
          const daily: DailyPage = {
            id: page.id,
            createdTime: page.createdTime,
            title: page.title,
            isLocked: page.isLocked,
            dateKey: classification.dateKey,
          };
          return { ...groups, dailies: [...groups.dailies, daily] };
        }
        case PAGE_KIND.weekly:
          return { ...groups, weeklies: [...groups.weeklies, toPeriodPage(weekly, page)] };
        case PAGE_KIND.monthly:
          return { ...groups, monthlies: [...groups.monthlies, toPeriodPage(monthly, page)] };
        case PAGE_KIND.memo:
          return groups;
      }
    },
    { dailies: [], weeklies: [], monthlies: [] },
  );
}
