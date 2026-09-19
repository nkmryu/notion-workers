import type { PageAction } from "./daily";
import type { DailyPage, PeriodPage, PeriodType } from "./page";

import { PAGE_ACTION_TYPE } from "./daily";
import { formatDailyTitleFromDateKey } from "./daily-title";
import { dateKeyToDate, getJstDateKey } from "./jst-date";

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
}

export function keyOfDateKey<K>(period: PeriodDefinition<K>, dateKey: string): K {
  return period.keyOfDate(dateKeyToDate(dateKey));
}

function isSameKey<K>(period: PeriodDefinition<K>, left: K, right: K): boolean {
  return period.compare(left, right) === 0;
}

export function decidePeriodPageAction<K>(
  period: PeriodDefinition<K>,
  page: Pick<PeriodPage<K>, "key" | "title" | "isLocked">,
  now: Date,
  canLock: boolean,
): PageAction {
  const comparison = period.compare(page.key, period.keyOfDate(now));

  if (comparison === 1) {
    return { type: PAGE_ACTION_TYPE.none };
  }

  const expectedTitle = period.formatTitle(page.key);

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
  dailies: readonly Pick<DailyPage, "dateKey">[],
  existingPages: readonly Pick<PeriodPage<K>, "key">[],
  now: Date,
): readonly PeriodCreationPlan<K>[] {
  const currentKey = period.keyOfDate(now);

  return dailies
    .reduce<readonly PeriodCreationPlan<K>[]>(function (plans, daily) {
      const key = keyOfDateKey(period, daily.dateKey);
      const planned = plans.some(function (plan) {
        return isSameKey(period, plan.key, key);
      });
      const exists = existingPages.some(function (page) {
        return isSameKey(period, page.key, key);
      });

      // 期間ページは期間が終わってから作成・転記・ロックを一度に行うアーカイブなので、進行中の期間には作らない。
      if (planned || exists || period.compare(key, currentKey) !== -1) {
        return plans;
      }

      return [...plans, { key, title: period.formatTitle(key) }];
    }, [])
    .toSorted(function (left, right) {
      return period.compare(left.key, right.key);
    });
}

// 期間内の終了済み Daily がすべて転記されている（見出しが揃っている）ときだけロックできる。
export function shouldLockPeriodPage<K>(
  period: PeriodDefinition<K>,
  page: Pick<PeriodPage<K>, "key" | "isLocked">,
  dailies: readonly Pick<DailyPage, "dateKey">[],
  headingTitles: readonly string[],
  now: Date,
): boolean {
  if (page.isLocked || period.compare(page.key, period.keyOfDate(now)) !== -1) {
    return false;
  }

  const todayKey = getJstDateKey(now);

  return dailies.every(function (daily) {
    const isEndedInPeriod =
      daily.dateKey < todayKey &&
      isSameKey(period, keyOfDateKey(period, daily.dateKey), page.key);

    return !isEndedInPeriod || headingTitles.includes(formatDailyTitleFromDateKey(daily.dateKey));
  });
}
