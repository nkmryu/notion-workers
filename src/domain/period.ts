import type { DailyPage } from "./daily";
import type { PageAction, PeriodType } from "./page";

import { Temporal } from "temporal-polyfill";

import { parseCreatedTime } from "./jst";
import { PAGE_ACTION_TYPE } from "./page";

// Weekly / Monthly に共通する「期間」の規則。期間キー K（ISO 週や暦月）の求め方・比較・タイトル整形を定義する。
export interface PeriodDefinition<K> {
  readonly type: PeriodType;
  // 閉じる前に Refs を要するか（Monthly）。要する期間は、Refs を飛ばしてロックされたページも補完するため、ロック済みでも転記状態を読む。
  readonly requiresRefs: boolean;
  readonly periodOf: (date: Temporal.PlainDate) => K;
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

// 永続化されている期間ページの姿。エンティティはここから生成し、期間はタイトルから導出する。
export interface PeriodPageRecord {
  readonly id: string;
  readonly createdTime: string;
  readonly title: string;
  readonly isLocked: boolean;
}

// 期間ページの期間は、タイトルが読めればタイトルから、読めなければ（テンプレート適用中など）作成日から決める。
function resolvePeriodKey<K>(period: PeriodDefinition<K>, record: PeriodPageRecord): K {
  const createdKey = period.periodOf(parseCreatedTime(record.createdTime));
  return period.parseTitle(record.title, period.yearOf(createdKey)) ?? createdKey;
}

// 転記状態: どの日を転記済みか、Refs があるか。
export interface TransferState {
  readonly transferredDates: readonly Temporal.PlainDate[];
  readonly hasRefs: boolean;
}

export const EMPTY_TRANSFER_STATE: TransferState = { transferredDates: [], hasRefs: false };

// 週・月のアーカイブページ。自分の期間の規則（PeriodDefinition）を持ち、期間キー K は生成時にタイトルから一度だけ確定する。
export class PeriodPage<K> {
  private constructor(
    readonly period: PeriodDefinition<K>,
    readonly id: string,
    readonly title: string,
    readonly isLocked: boolean,
    readonly key: K,
  ) {}

  static fromRecord<K>(period: PeriodDefinition<K>, record: PeriodPageRecord): PeriodPage<K> {
    return new PeriodPage(
      period,
      record.id,
      record.title,
      record.isLocked,
      resolvePeriodKey(period, record),
    );
  }

  // 作成直後のページ。テンプレートの非同期適用でタイトルが未確定なので空とし、同じ実行でリネーム対象にする。
  static created<K>(period: PeriodDefinition<K>, id: string, key: K): PeriodPage<K> {
    return new PeriodPage(period, id, "", false, key);
  }

  get expectedTitle(): string {
    return this.period.formatTitle(this.key);
  }

  sameIdentityAs(other: { readonly id: string }): boolean {
    return this.id === other.id;
  }

  isSamePeriodAs(key: K): boolean {
    return this.period.compare(this.key, key) === 0;
  }

  contains(date: Temporal.PlainDate): boolean {
    return this.isSamePeriodAs(this.period.periodOf(date));
  }

  // 期間が終わっているか。進行中・未来の期間は閉じない。
  isPast(today: Temporal.PlainDate): boolean {
    return this.period.compare(this.key, this.period.periodOf(today)) < 0;
  }

  isFuture(today: Temporal.PlainDate): boolean {
    return this.period.compare(this.key, this.period.periodOf(today)) > 0;
  }

  // もう手を入れないページか。ロック済みで、ロック後に補う工程（Refs）も要らない。転記状態を読む必要が無い。
  isSettled(): boolean {
    return this.isLocked && !this.period.requiresRefs;
  }

  withTransferState(state: TransferState): PeriodArchive<K> {
    return new PeriodArchive(this, state);
  }
}

// 転記状態を知った期間ページ。ロックと Refs の判断はこの状態だけで下せる。
// 同じページの「本文を読む前 / 後」なので、継承ではなく期間ページを内側に持つ。
export class PeriodArchive<K> {
  constructor(
    readonly page: PeriodPage<K>,
    readonly transferState: TransferState,
  ) {}

  get id(): string {
    return this.page.id;
  }

  get key(): K {
    return this.page.key;
  }

  get isLocked(): boolean {
    return this.page.isLocked;
  }

  get hasRefs(): boolean {
    return this.transferState.hasRefs;
  }

  contains(date: Temporal.PlainDate): boolean {
    return this.page.contains(date);
  }

  isPast(today: Temporal.PlainDate): boolean {
    return this.page.isPast(today);
  }

  isTransferred(date: Temporal.PlainDate): boolean {
    return this.transferState.transferredDates.some(function (transferred) {
      return transferred.equals(date);
    });
  }

  // 期間内の終了済み Daily がすべて転記されているか。過去の期間だけが完了し得る。
  isFullyTransferred(dailies: readonly DailyPage[], today: Temporal.PlainDate): boolean {
    if (!this.page.isPast(today)) {
      return false;
    }

    return dailies.every((daily) => {
      const isEndedInPeriod = daily.isEnded(today) && this.page.contains(daily.date);
      return !isEndedInPeriod || this.isTransferred(daily.date);
    });
  }

  // 期間ページを整えて閉じるまでの操作を、適用する順に返す。
  // ロックは「期間が終わり、転記が揃った」ときに限る、という不変条件をここで守る。
  decideActions(dailies: readonly DailyPage[], today: Temporal.PlainDate): readonly PageAction[] {
    if (this.page.isFuture(today)) {
      return [];
    }

    // 作成直後のページはテンプレート適用でタイトルが未確定なので、同じ実行でリネームしてから閉じる。
    const rename: readonly PageAction[] =
      this.page.title === this.page.expectedTitle
        ? []
        : [{ type: PAGE_ACTION_TYPE.rename, title: this.page.expectedTitle }];
    const lock: readonly PageAction[] =
      !this.page.isLocked && this.isFullyTransferred(dailies, today)
        ? [{ type: PAGE_ACTION_TYPE.lock }]
        : [];

    return [...rename, ...lock];
  }

  // 転記できた日を状態へ足した新しいインスタンスを返す。期間外の日は転記計画が作らないので、混入は不整合として失敗させる。
  withTransferred(date: Temporal.PlainDate): PeriodArchive<K> {
    if (!this.page.contains(date)) {
      throw new Error(`${this.page.expectedTitle} の期間外の日付です: ${date.toString()}`);
    }

    return new PeriodArchive(this.page, {
      ...this.transferState,
      transferredDates: [...this.transferState.transferredDates, date],
    });
  }
}

export function planMissingPeriodPages<K>(
  period: PeriodDefinition<K>,
  dailies: readonly DailyPage[],
  existingPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
): readonly PeriodCreationPlan<K>[] {
  const currentKey = period.periodOf(today);

  return dailies
    .reduce<readonly PeriodCreationPlan<K>[]>(function (plans, daily) {
      const key = period.periodOf(daily.date);
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
