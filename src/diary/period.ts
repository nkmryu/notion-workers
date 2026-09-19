import { Temporal } from "temporal-polyfill";

import type { PageAction } from "./daily";
import type { DailyPage, PeriodArchive, PeriodPage, PeriodType } from "./page";

import { PAGE_ACTION_TYPE } from "./daily";
import { parseCreatedTime } from "./jst";

// Weekly / Monthly に共通する「期間」の規則。期間キー K（ISO 週や暦月）の求め方・比較・タイトル整形を定義する。
export interface PeriodDefinition<K> {
  readonly type: PeriodType;
  // ロック前に行う工程（Monthly の Refs）を持つか。持つ期間は、工程を飛ばしてロックされたページを補完するため、ロック済みでも状態を読む。
  readonly hasBeforeLockStep: boolean;
  readonly keyOf: (date: Temporal.PlainDate) => K;
  // 符号だけを見る（負: left が前、0: 同じ、正: left が後）。
  readonly compare: (left: K, right: K) => number;
  readonly formatTitle: (key: K) => string;
  readonly parseTitle: (title: string, referenceYear: number) => K | null;
  readonly yearOf: (key: K) => number;
}

export interface PeriodCreationPlan<K> {
  readonly key: K;
  readonly title: string;
}

// 期間タイトルの "26" のような 2 桁年を、基準年に最も近い 4 桁年へ解決する。
export function resolveShortYear(shortYear: number, referenceYear: number): number {
  const century = Math.floor(referenceYear / 100) * 100;
  const candidates = [
    century - 100 + shortYear,
    century + shortYear,
    century + 100 + shortYear,
  ];

  return candidates.reduce(function (closest, candidate) {
    const closestDistance = Math.abs(closest - referenceYear);
    const candidateDistance = Math.abs(candidate - referenceYear);
    return candidateDistance < closestDistance ? candidate : closest;
  });
}

// 期間ページの期間は、タイトルが読めればタイトルから、読めなければ（テンプレート適用中など）作成日から決める。
export function resolvePeriodKey<K>(
  period: PeriodDefinition<K>,
  page: { readonly title: string; readonly createdTime: string },
): K {
  const createdKey = period.keyOf(parseCreatedTime(page.createdTime));
  return period.parseTitle(page.title, period.yearOf(createdKey)) ?? createdKey;
}

function isSameKey<K>(period: PeriodDefinition<K>, left: K, right: K): boolean {
  return period.compare(left, right) === 0;
}

export function isTransferred<K>(
  archive: Pick<PeriodArchive<K>, "transferredDates">,
  date: Temporal.PlainDate,
): boolean {
  return archive.transferredDates.some(function (transferred) {
    return transferred.equals(date);
  });
}

// 期間内の終了済み Daily がすべて転記されているか。過去の期間だけが完了し得る。
export function isFullyTransferred<K>(
  period: PeriodDefinition<K>,
  archive: Pick<PeriodArchive<K>, "key" | "transferredDates">,
  dailies: readonly Pick<DailyPage, "date">[],
  today: Temporal.PlainDate,
): boolean {
  if (period.compare(archive.key, period.keyOf(today)) >= 0) {
    return false;
  }

  return dailies.every(function (daily) {
    const isEndedInPeriod =
      Temporal.PlainDate.compare(daily.date, today) < 0 &&
      isSameKey(period, period.keyOf(daily.date), archive.key);

    return !isEndedInPeriod || isTransferred(archive, daily.date);
  });
}

// 期間ページへの操作を決める。ロックは「期間が終わり、転記が揃った」ときに限る、という不変条件をここで守る。
export function decidePeriodPageAction<K>(
  period: PeriodDefinition<K>,
  archive: Pick<PeriodArchive<K>, "key" | "title" | "isLocked" | "transferredDates">,
  dailies: readonly Pick<DailyPage, "date">[],
  today: Temporal.PlainDate,
): PageAction {
  if (period.compare(archive.key, period.keyOf(today)) > 0) {
    return { type: PAGE_ACTION_TYPE.none };
  }

  const expectedTitle = period.formatTitle(archive.key);

  if (archive.title !== expectedTitle) {
    return { type: PAGE_ACTION_TYPE.rename, title: expectedTitle };
  }

  if (!archive.isLocked && isFullyTransferred(period, archive, dailies, today)) {
    return { type: PAGE_ACTION_TYPE.lock };
  }

  return { type: PAGE_ACTION_TYPE.none };
}

export function planMissingPeriodPages<K>(
  period: PeriodDefinition<K>,
  dailies: readonly Pick<DailyPage, "date">[],
  existingPages: readonly Pick<PeriodPage<K>, "key">[],
  today: Temporal.PlainDate,
): readonly PeriodCreationPlan<K>[] {
  const currentKey = period.keyOf(today);

  return dailies
    .reduce<readonly PeriodCreationPlan<K>[]>(function (plans, daily) {
      const key = period.keyOf(daily.date);
      const planned = plans.some(function (plan) {
        return isSameKey(period, plan.key, key);
      });
      const exists = existingPages.some(function (page) {
        return isSameKey(period, page.key, key);
      });

      // 期間ページは期間が終わってから作成・転記・ロックを一度に行うアーカイブなので、進行中の期間には作らない。
      if (planned || exists || period.compare(key, currentKey) >= 0) {
        return plans;
      }

      return [...plans, { key, title: period.formatTitle(key) }];
    }, [])
    .toSorted(function (left, right) {
      return period.compare(left.key, right.key);
    });
}
