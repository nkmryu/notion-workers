import { Temporal } from "temporal-polyfill";

import type { DailyPage } from "./daily";
import type { PageAction, PeriodType } from "./page";

import { parseCreatedTime } from "./jst";
import { PAGE_ACTION_TYPE } from "./page";

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

export interface PeriodPageProps<K> {
  readonly id: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly key: K;
}

// 週・月のアーカイブページ。自分の期間の規則（PeriodDefinition）を持ち、期間キー K はタイトルから一度だけ確定する。
export class PeriodPage<K> {
  readonly period: PeriodDefinition<K>;
  readonly id: string;
  readonly title: string;
  readonly isLocked: boolean;
  readonly key: K;

  constructor(period: PeriodDefinition<K>, props: PeriodPageProps<K>) {
    this.period = period;
    this.id = props.id;
    this.title = props.title;
    this.isLocked = props.isLocked;
    this.key = props.key;
  }

  get expectedTitle(): string {
    return this.period.formatTitle(this.key);
  }

  isSamePeriodAs(key: K): boolean {
    return this.period.compare(this.key, key) === 0;
  }

  contains(date: Temporal.PlainDate): boolean {
    return this.isSamePeriodAs(this.period.keyOf(date));
  }

  // 期間が終わっているか。進行中・未来の期間は閉じない。
  isPast(today: Temporal.PlainDate): boolean {
    return this.period.compare(this.key, this.period.keyOf(today)) < 0;
  }

  isFuture(today: Temporal.PlainDate): boolean {
    return this.period.compare(this.key, this.period.keyOf(today)) > 0;
  }

  withArchiveState(state: {
    readonly transferredDates: readonly Temporal.PlainDate[];
    readonly hasRefs: boolean;
  }): PeriodArchive<K> {
    return new PeriodArchive(this.period, { ...this, ...state });
  }
}

export interface PeriodArchiveProps<K> extends PeriodPageProps<K> {
  readonly transferredDates: readonly Temporal.PlainDate[];
  readonly hasRefs: boolean;
}

// 期間ページに、その時点の転記状態（どの日を転記済みか・Refs があるか）を添えたもの。
// ロックと Refs の判断はこの状態だけで下せる。
export class PeriodArchive<K> extends PeriodPage<K> {
  readonly transferredDates: readonly Temporal.PlainDate[];
  readonly hasRefs: boolean;

  constructor(period: PeriodDefinition<K>, props: PeriodArchiveProps<K>) {
    super(period, props);
    this.transferredDates = props.transferredDates;
    this.hasRefs = props.hasRefs;
  }

  isTransferred(date: Temporal.PlainDate): boolean {
    return this.transferredDates.some(function (transferred) {
      return transferred.equals(date);
    });
  }

  // 期間内の終了済み Daily がすべて転記されているか。過去の期間だけが完了し得る。
  isFullyTransferred(dailies: readonly DailyPage[], today: Temporal.PlainDate): boolean {
    if (!this.isPast(today)) {
      return false;
    }

    return dailies.every((daily) => {
      const isEndedInPeriod = daily.isEnded(today) && this.contains(daily.date);
      return !isEndedInPeriod || this.isTransferred(daily.date);
    });
  }

  // 期間ページを整えて閉じるまでの操作を、適用する順に返す。
  // ロックは「期間が終わり、転記が揃った」ときに限る、という不変条件をここで守る。
  decideActions(dailies: readonly DailyPage[], today: Temporal.PlainDate): readonly PageAction[] {
    if (this.isFuture(today)) {
      return [];
    }

    // 作成直後のページはテンプレート適用でタイトルが未確定なので、同じ実行でリネームしてから閉じる。
    const rename: readonly PageAction[] =
      this.title === this.expectedTitle
        ? []
        : [{ type: PAGE_ACTION_TYPE.rename, title: this.expectedTitle }];
    const lock: readonly PageAction[] =
      !this.isLocked && this.isFullyTransferred(dailies, today)
        ? [{ type: PAGE_ACTION_TYPE.lock }]
        : [];

    return [...rename, ...lock];
  }

  // 転記できた日を状態へ足した新しいインスタンスを返す。同じ実行内のロック判定へ反映するため。
  withTransferred(date: Temporal.PlainDate): PeriodArchive<K> {
    return new PeriodArchive(this.period, {
      ...this,
      transferredDates: [...this.transferredDates, date],
    });
  }
}

export function planMissingPeriodPages<K>(
  period: PeriodDefinition<K>,
  dailies: readonly DailyPage[],
  existingPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
): readonly PeriodCreationPlan<K>[] {
  const currentKey = period.keyOf(today);

  return dailies
    .reduce<readonly PeriodCreationPlan<K>[]>(function (plans, daily) {
      const key = period.keyOf(daily.date);
      const planned = plans.some(function (plan) {
        return period.compare(plan.key, key) === 0;
      });
      const exists = existingPages.some(function (page) {
        return page.isSamePeriodAs(key);
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
