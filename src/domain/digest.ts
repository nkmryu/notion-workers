import type { DailyPage } from "./daily";
import type { NewDaily } from "./diary-repository";
import type { PageAction } from "./page";

import { Temporal } from "temporal-polyfill";

import { compareDailies, formatDailyTitle, parseDailyTitle } from "./daily";
import { removeDigest } from "./markdown-section";
import { PAGE_ACTION_TYPE } from "./page";
import { REFS_HEADING_TITLE } from "./refs";

// まとめの種類。週は転記だけ、月は転記と Refs を書く。
export const DIGEST_KIND = {
  weekly: "weekly",
  monthly: "monthly",
} as const;
export type DigestKind = (typeof DIGEST_KIND)[keyof typeof DIGEST_KIND];

function formatShortYear(year: number): string {
  return (year % 100).toString().padStart(2, "0");
}

function formatTwoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

function isMonthEnd(date: Temporal.PlainDate): boolean {
  return date.day === date.daysInMonth;
}

// まとめを作る期間。週は ISO 週（月〜日）、月は暦月で、どちらも最後の日（締めの日）で識別する。
// まとめは締めの日の Daily の末尾に書く。
export class DigestPeriod {
  private constructor(
    readonly kind: DigestKind,
    readonly closingDate: Temporal.PlainDate,
  ) {}

  // Temporal の dayOfWeek は月曜 = 1 … 日曜 = 7。
  static weekOf(date: Temporal.PlainDate): DigestPeriod {
    return new DigestPeriod(DIGEST_KIND.weekly, date.add({ days: 7 - date.dayOfWeek }));
  }

  static monthOf(date: Temporal.PlainDate): DigestPeriod {
    return new DigestPeriod(DIGEST_KIND.monthly, date.with({ day: date.daysInMonth }));
  }

  // その日を締めの日とする期間。月末は月、それ以外の日曜は週、ほかの日は null。
  // 日曜が月末と重なる日は、月のまとめだけを書くので月を返す。
  static closingOn(date: Temporal.PlainDate): DigestPeriod | null {
    if (isMonthEnd(date)) {
      return DigestPeriod.monthOf(date);
    }

    return date.dayOfWeek === 7 ? DigestPeriod.weekOf(date) : null;
  }

  // まとめの見出し。旧 Weekly / Monthly のタイトルと同じ形なので、Notion の検索で辿れる。
  // 年をまたぐ ISO 週は、木曜が属する年（yearOfWeek）で数える。
  get label(): string {
    const date = this.closingDate;

    return this.kind === DIGEST_KIND.weekly
      ? `${formatShortYear(date.yearOfWeek ?? date.year)}.W${formatTwoDigits(date.weekOfYear ?? 1)}`
      : `${formatShortYear(date.year)}.M${formatTwoDigits(date.month)}`;
  }

  contains(date: Temporal.PlainDate): boolean {
    const own = this.kind === DIGEST_KIND.weekly ? DigestPeriod.weekOf(date) : DigestPeriod.monthOf(date);
    return own.closingDate.equals(this.closingDate);
  }

  // 締めの日が終わった期間だけ、まとめを書く。締めの日の本文まで書き終わっている。
  isEnded(today: Temporal.PlainDate): boolean {
    return Temporal.PlainDate.compare(this.closingDate, today) < 0;
  }

  // 日曜が月末と重なる週。その週の月〜土は必ず同じ月に入るので、月のまとめに含まれる。
  isCoveredByMonth(): boolean {
    return this.kind === DIGEST_KIND.weekly && isMonthEnd(this.closingDate);
  }

  equals(other: DigestPeriod): boolean {
    return this.kind === other.kind && this.closingDate.equals(other.closingDate);
  }
}

function compareDigestPeriods(left: DigestPeriod, right: DigestPeriod): number {
  const dateComparison = Temporal.PlainDate.compare(left.closingDate, right.closingDate);
  return dateComparison !== 0 ? dateComparison : left.kind.localeCompare(right.kind);
}

// まとめを書く期間: 締めの日が終わり、Daily が 1 件以上ある期間。日付順に返す。
// 日曜が月末と重なる週は、月のまとめだけにする。
export function listEndedDigestPeriods(
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): readonly DigestPeriod[] {
  return dailies
    .flatMap(function (daily) {
      return [DigestPeriod.weekOf(daily.date), DigestPeriod.monthOf(daily.date)];
    })
    .filter(function (period) {
      return period.isEnded(today) && !period.isCoveredByMonth();
    })
    .reduce<readonly DigestPeriod[]>(function (periods, period) {
      return periods.some(function (listed) {
        return listed.equals(period);
      })
        ? periods
        : [...periods, period];
    }, [])
    .toSorted(compareDigestPeriods);
}

// まとめの置き場は締めの日の Daily。同じ日に複数あれば、最初に作られたものにする。
export function findClosingDaily(
  period: DigestPeriod,
  dailies: readonly DailyPage[],
): DailyPage | null {
  return (
    dailies
      .filter(function (daily) {
        return daily.isOn(period.closingDate);
      })
      .toSorted(compareDailies)[0] ?? null
  );
}

// 締めの日に Daily が無い期間は、まとめの置き場として締めの日の Daily を作る。
// 作るのは、締めの日でない日の Daily がある期間だけ。作る Daily は日曜か月末なので、
// 作った Daily が別の種類の期間（月末なら週、日曜なら月）を生み、締めの日を作り続ける連鎖を止める。
export function planMissingClosingDailies(
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): readonly NewDaily[] {
  return listEndedDigestPeriods(dailies, today)
    .filter(function (period) {
      const hasOrdinaryDay = dailies.some(function (daily) {
        return period.contains(daily.date) && DigestPeriod.closingOn(daily.date) === null;
      });

      return hasOrdinaryDay && findClosingDaily(period, dailies) === null;
    })
    .map(function ({ closingDate }) {
      return { title: formatDailyTitle(closingDate), date: closingDate };
    });
}

// まとめを書き終えていない締めの日の Daily。まとめの段階が閉じるまで、Daily の段階ではロックしない。
export function listAwaitingClosingDailies(
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): readonly DailyPage[] {
  return listEndedDigestPeriods(dailies, today).flatMap(function (period) {
    const closing = findClosingDaily(period, dailies);
    return closing === null || closing.isLocked ? [] : [closing];
  });
}

// まとめの状態: まとめの見出しがあるか、どの日を転記済みか、Refs があるか。
export interface DigestState {
  readonly hasHeader: boolean;
  readonly transferredDates: readonly Temporal.PlainDate[];
  readonly hasRefs: boolean;
}

// まとめの見出しより後ろの見出しから読む。見出しが無ければ、まだ何も書いていない。
export function deriveDigestState(sectionTitles: readonly string[] | null): DigestState {
  if (sectionTitles === null) {
    return { hasHeader: false, transferredDates: [], hasRefs: false };
  }

  return {
    hasHeader: true,
    transferredDates: sectionTitles.flatMap(function (title) {
      const date = parseDailyTitle(title);
      return date === null ? [] : [date];
    }),
    hasRefs: sectionTitles.includes(REFS_HEADING_TITLE),
  };
}

// 転記元として写す本文。締めの日の Daily なら、そのページが持つまとめを除き、その日自身の本文だけにする。
export function extractOwnBody(markdown: string, date: Temporal.PlainDate): string {
  const ownPeriod = DigestPeriod.closingOn(date);
  return ownPeriod === null ? markdown : removeDigest(markdown, ownPeriod.label);
}

// 1 日分を写す計画。heading は日付見出しで、転記済み判定の冪等キーになる。同じ日の Daily は 1 つの見出しの下へ並べる。
export interface TransferPlan {
  readonly date: Temporal.PlainDate;
  readonly heading: string;
  readonly dailyPageIds: readonly string[];
}

function addToPlans(plans: readonly TransferPlan[], daily: DailyPage): readonly TransferPlan[] {
  const last = plans.at(-1);

  if (last !== undefined && last.date.equals(daily.date)) {
    return plans.with(-1, { ...last, dailyPageIds: [...last.dailyPageIds, daily.id] });
  }

  return [...plans, { date: daily.date, heading: daily.expectedTitle, dailyPageIds: [daily.id] }];
}

// まとめを書く締めの日の Daily と、その期間・まとめの状態。ロックは、期間の全日が転記されたときに限る。
export class DigestTarget {
  constructor(
    readonly period: DigestPeriod,
    readonly closingDaily: DailyPage,
    readonly state: DigestState,
  ) {}

  get id(): string {
    return this.closingDaily.id;
  }

  get label(): string {
    return this.period.label;
  }

  // Refs は月のまとめだけに、一度だけ書く。
  get needsRefs(): boolean {
    return this.period.kind === DIGEST_KIND.monthly && !this.state.hasRefs;
  }

  // まとめへ写す Daily: 期間内の Daily のうち、置き場の Daily 自身を除いたもの。日付順に並べる。
  private sourcesIn(dailies: readonly DailyPage[]): readonly DailyPage[] {
    return dailies
      .filter((daily) => {
        return daily.id !== this.id && this.period.contains(daily.date);
      })
      .toSorted(compareDailies);
  }

  private isTransferred(date: Temporal.PlainDate): boolean {
    return this.state.transferredDates.some(function (transferred) {
      return transferred.equals(date);
    });
  }

  planTransfers(dailies: readonly DailyPage[]): readonly TransferPlan[] {
    return this.sourcesIn(dailies)
      .filter((daily) => {
        return !this.isTransferred(daily.date);
      })
      .reduce(addToPlans, []);
  }

  isComplete(dailies: readonly DailyPage[]): boolean {
    return this.sourcesIn(dailies).every((daily) => {
      return this.isTransferred(daily.date);
    });
  }

  // まとめが揃ったら締めの日の Daily を閉じる。
  decideActions(dailies: readonly DailyPage[]): readonly PageAction[] {
    return !this.closingDaily.isLocked && this.isComplete(dailies)
      ? [{ type: PAGE_ACTION_TYPE.lock }]
      : [];
  }

  withHeader(): DigestTarget {
    return new DigestTarget(this.period, this.closingDaily, { ...this.state, hasHeader: true });
  }

  // 期間外の日は転記計画が作らないので、混入は不整合として失敗させる。
  withTransferred(date: Temporal.PlainDate): DigestTarget {
    if (!this.period.contains(date)) {
      throw new Error(`${this.label} の期間外の日付です: ${date.toString()}`);
    }

    return new DigestTarget(this.period, this.closingDaily, {
      ...this.state,
      transferredDates: [...this.state.transferredDates, date],
    });
  }

  withRefs(): DigestTarget {
    return new DigestTarget(this.period, this.closingDaily, { ...this.state, hasRefs: true });
  }
}
