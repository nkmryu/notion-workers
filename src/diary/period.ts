import type { PageAction } from "./daily";

import { PAGE_ACTION_TYPE } from "./daily";
import type { LockablePage, PageIdentity, PeriodType } from "./page";

import { formatDailyTitleFromDateKey } from "./daily-title";
import { dateKeyToDate, getJstDateKey, parseCreatedTime } from "./jst-date";
import { getDailyDateKey } from "./page";

// Weekly / Monthly に共通する「期間」の規則。期間キー K（ISO 週や暦月）の求め方・比較・タイトル整形を定義する。
export interface PeriodDefinition<K> {
  readonly type: PeriodType;
  // ロック後にも追記する工程（Monthly の Refs）を持つか。持つ期間はロック済みページの見出しも読む。
  readonly finalizesAfterLock: boolean;
  readonly keyOfDate: (date: Date) => K;
  readonly compare: (left: K, right: K) => -1 | 0 | 1;
  readonly formatTitle: (key: K) => string;
  readonly parseTitle: (title: string, referenceYear: number) => K | null;
  readonly yearOf: (key: K) => number;
}

export interface PeriodCreationPlan<K> {
  readonly key: K;
  readonly title: string;
  // Notion の created_time は遡及できないため、同一実行内では期間内の Daily タイトル日で期間を識別する。
  readonly representativeCreatedTime: string;
}

export function keyOfDateKey<K>(
  period: PeriodDefinition<K>,
  dateKey: string,
): K {
  return period.keyOfDate(dateKeyToDate(dateKey));
}

// 期間ページの期間は、タイトルが読めればタイトルから、読めなければ作成日から決める。
export function getPeriodPageKey<K>(
  period: PeriodDefinition<K>,
  page: Pick<PageIdentity, "createdTime" | "title">,
): K {
  const createdKey = period.keyOfDate(parseCreatedTime(page.createdTime));
  return period.parseTitle(page.title, period.yearOf(createdKey)) ?? createdKey;
}

function isSameKey<K>(period: PeriodDefinition<K>, left: K, right: K): boolean {
  return period.compare(left, right) === 0;
}

export function decidePeriodPageAction<K>(
  period: PeriodDefinition<K>,
  page: LockablePage,
  now: Date,
  canLock: boolean,
): PageAction {
  if (page.periodType !== period.type) {
    return { type: PAGE_ACTION_TYPE.none };
  }

  const pageKey = getPeriodPageKey(period, page);
  const comparison = period.compare(pageKey, period.keyOfDate(now));

  if (comparison === 1) {
    return { type: PAGE_ACTION_TYPE.none };
  }

  const expectedTitle = period.formatTitle(pageKey);

  if (page.title !== expectedTitle) {
    return { type: PAGE_ACTION_TYPE.rename, title: expectedTitle };
  }

  if (comparison === -1 && !page.isLocked && canLock) {
    return { type: PAGE_ACTION_TYPE.lock };
  }

  return { type: PAGE_ACTION_TYPE.none };
}

export function planMissingPeriodPages<K>(
  period: PeriodDefinition<K>,
  pages: readonly PageIdentity[],
  now: Date,
): readonly PeriodCreationPlan<K>[] {
  const currentKey = period.keyOfDate(now);
  const existingKeys = pages.flatMap<K>(function (page) {
    return page.periodType === period.type
      ? [getPeriodPageKey(period, page)]
      : [];
  });

  return pages
    .reduce<readonly PeriodCreationPlan<K>[]>(function (plans, page) {
      const dateKey = getDailyDateKey(page, now);

      if (dateKey === null) {
        return plans;
      }

      const representativeDate = dateKeyToDate(dateKey);
      const key = period.keyOfDate(representativeDate);
      const planned = plans.some(function (plan) {
        return isSameKey(period, plan.key, key);
      });
      const exists = existingKeys.some(function (existing) {
        return isSameKey(period, existing, key);
      });

      // 期間ページは期間が終わってから作成・転記・ロックを一度に行うアーカイブなので、進行中の期間には作らない。
      if (planned || exists || period.compare(key, currentKey) !== -1) {
        return plans;
      }

      return [
        ...plans,
        {
          key,
          title: period.formatTitle(key),
          representativeCreatedTime: representativeDate.toISOString(),
        },
      ];
    }, [])
    .toSorted(function (left, right) {
      return period.compare(left.key, right.key);
    });
}

// 期間内の終了済み Daily がすべて転記されている（見出しが揃っている）ときだけロックできる。
export function shouldLockPeriodPage<K>(
  period: PeriodDefinition<K>,
  page: LockablePage,
  pages: readonly PageIdentity[],
  headingTitles: readonly string[],
  now: Date,
): boolean {
  if (page.periodType !== period.type || page.isLocked) {
    return false;
  }

  const pageKey = getPeriodPageKey(period, page);

  if (period.compare(pageKey, period.keyOfDate(now)) !== -1) {
    return false;
  }

  const todayKey = getJstDateKey(now);

  return pages.every(function (candidate) {
    const dateKey = getDailyDateKey(candidate, now);

    if (
      dateKey === null ||
      dateKey >= todayKey ||
      !isSameKey(period, keyOfDateKey(period, dateKey), pageKey)
    ) {
      return true;
    }

    return headingTitles.includes(formatDailyTitleFromDateKey(dateKey));
  });
}
