import type { DailyPage } from "./daily";
import type { NewDaily } from "./diary-repository";
import type { PageAction } from "./page";

import { Temporal } from "temporal-polyfill";

import type { DigestParts } from "./markdown-section";

import { compareDailies, formatDailyTitle, parseDailyTitle } from "./daily";
import { isBlankBody, removeDigest } from "./markdown-section";
import { PAGE_ACTION_TYPE } from "./page";
import { REFS_HEADING_TITLE } from "./refs";
import { UNTRANSFERRED_NOTICES } from "./transfer-markdown";

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

function isSameMonth(left: Temporal.PlainDate, right: Temporal.PlainDate): boolean {
  return left.year === right.year && left.month === right.month;
}

// まとめを作る期間。週は ISO 週（月〜日）、月は暦月で、どちらも最後の日（締めの日）で識別する。
// まとめは締めの日の Daily の末尾に書く。
// 今月の日は週のまとめだけに、前の月までの日は月のまとめだけに入れる。週は締めの日と同じ月の日だけを含み、
// 月が終わると、その月の週のまとめは月のまとめに置き換わる。
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

  // 月をまたぐ週は、締めの日（日曜）と同じ月の日だけを含む。前の月の日は、その月のまとめに入る。
  contains(date: Temporal.PlainDate): boolean {
    if (this.kind === DIGEST_KIND.monthly) {
      return DigestPeriod.monthOf(date).closingDate.equals(this.closingDate);
    }

    return DigestPeriod.weekOf(date).closingDate.equals(this.closingDate) && isSameMonth(date, this.closingDate);
  }

  // 締めの日が終わった期間だけ、まとめを書く。締めの日の本文まで書き終わっている。
  isEnded(today: Temporal.PlainDate): boolean {
    return Temporal.PlainDate.compare(this.closingDate, today) < 0;
  }

  // まとめを書く時期か。月は終わった月すべて、週は終わった週のうち今月のものだけ。
  // 日曜が月末と重なる週は、終わった時点で前の月になるので書かない（月のまとめに含まれる）。
  isDue(today: Temporal.PlainDate): boolean {
    return this.isEnded(today) && (this.kind === DIGEST_KIND.monthly || isSameMonth(this.closingDate, today));
  }

  equals(other: DigestPeriod): boolean {
    return this.kind === other.kind && this.closingDate.equals(other.closingDate);
  }
}

function compareDigestPeriods(left: DigestPeriod, right: DigestPeriod): number {
  const dateComparison = Temporal.PlainDate.compare(left.closingDate, right.closingDate);
  return dateComparison !== 0 ? dateComparison : left.kind.localeCompare(right.kind);
}

// まとめを書く期間: 書く時期が来ていて（isDue）、Daily が 1 件以上ある期間。日付順に返す。
export function listDueDigestPeriods(
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): readonly DigestPeriod[] {
  return dailies
    .flatMap(function (daily) {
      return [DigestPeriod.weekOf(daily.date), DigestPeriod.monthOf(daily.date)].filter(function (period) {
        return period.contains(daily.date);
      });
    })
    .filter(function (period) {
      return period.isDue(today);
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
// 作るのは、締めの日でない日の Daily がある期間だけ。月は日曜の Daily も数える。週が終わって普通の日を
// ゴミ箱へ移した月でも、日曜にある週のまとめを月のまとめへ移す置き場が要るため。
// 作った Daily が締めの日を作り続ける連鎖は起きない。作った月末の Daily は、日曜が同じ月にある週に入らない。
// 作った日曜の Daily は、その週に普通の日がある月にしか作らないので、月末の Daily を新たに生まない。
export function planMissingClosingDailies(
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): readonly NewDaily[] {
  return listDueDigestPeriods(dailies, today)
    .filter(function (period) {
      const hasSourceDay = dailies.some(function (daily) {
        return period.contains(daily.date) && !daily.isOn(period.closingDate);
      });

      return hasSourceDay && findClosingDaily(period, dailies) === null;
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
  return listDueDigestPeriods(dailies, today).flatMap(function (period) {
    const closing = findClosingDaily(period, dailies);
    return closing === null || closing.isLocked ? [] : [closing];
  });
}

// 月が終わったときに、日曜の Daily の週のまとめをどうするか。
export const WEEKLY_CLEANUP = {
  // 週のまとめが無い（消し終えた、または書かなかった）
  none: "none",
  // 週のまとめだけを消し、日曜自身の本文を残す
  removeDigest: "removeDigest",
  // 週のまとめを除くと本文が空なので、Daily ごとゴミ箱へ移す
  trashPage: "trashPage",
} as const;
export type WeeklyCleanup =
  | { readonly type: typeof WEEKLY_CLEANUP.none }
  | { readonly type: typeof WEEKLY_CLEANUP.removeDigest; readonly digest: string }
  | { readonly type: typeof WEEKLY_CLEANUP.trashPage };

// 本文が空の日曜は、週のまとめを消してから捨てるのではなく、まとめごとゴミ箱へ移す。
// 消してから捨てる 2 段にすると、間で失敗したときに、まとめの見出しという手がかりの無い空の Daily が残る。
export function decideWeeklyCleanup(parts: DigestParts | null): WeeklyCleanup {
  if (parts === null) {
    return { type: WEEKLY_CLEANUP.none };
  }

  return isBlankBody(parts.ownBody)
    ? { type: WEEKLY_CLEANUP.trashPage }
    : { type: WEEKLY_CLEANUP.removeDigest, digest: parts.digest };
}

// まとめを、日付の見出しごとの本文に分けたもの。Refs の見出しより後ろは date が null。
interface DateSection {
  readonly heading: string;
  readonly date: Temporal.PlainDate | null;
  readonly lines: readonly string[];
}

interface SplitState {
  readonly sections: readonly DateSection[];
  readonly inFence: boolean;
}

// 子ブロックの中のコードブロックは、タブでインデントされた行になる。
const FENCE_LINE_PATTERN = /^\s*```/;

// 本文に見出し 2 を書いた日もあるので、日付の見出しと Refs の見出しだけで区切る。
// 節の本文は月のまとめへ写すので、コードブロックは残し、その中の見出しでは区切らない。
function splitByDateHeadings(digest: string): readonly DateSection[] {
  return digest.split("\n").reduce<SplitState>(
    function ({ sections, inFence }, line) {
      const heading = inFence ? undefined : /^## (.+)$/.exec(line)?.[1]?.trim();

      if (heading !== undefined && (parseDailyTitle(heading) !== null || heading === REFS_HEADING_TITLE)) {
        return { sections: [...sections, { heading, date: parseDailyTitle(heading), lines: [] }], inFence };
      }

      const last = sections.at(-1);
      return {
        sections: last === undefined ? sections : sections.with(-1, { ...last, lines: [...last.lines, line] }),
        inFence: FENCE_LINE_PATTERN.test(line) ? !inFence : inFence,
      };
    },
    { sections: [], inFence: false },
  ).sections;
}

// 週のまとめにある 1 日分の節。週が終わって元の Daily をゴミ箱へ移した日は、月のまとめへここから写す。
export interface CarriedSection {
  readonly date: Temporal.PlainDate;
  readonly heading: string;
  readonly body: string;
}

// digest は週のまとめ（見出しから末尾まで）。
export function extractCarriedSections(digest: string): readonly CarriedSection[] {
  return splitByDateHeadings(digest).flatMap(function ({ heading, date, lines }) {
    return date === null ? [] : [{ date, heading, body: lines.join("\n") }];
  });
}

// まとめのうち、本文を写せなかった日（コピーできないブロックの案内か、転記を省いた注記がある日）。
// 画像・ファイルの案内だけの日は含めない。
export function listUntransferredDates(digest: string): readonly Temporal.PlainDate[] {
  return splitByDateHeadings(digest).flatMap(function ({ date, lines }) {
    const body = lines.join("\n");
    const untransferred = UNTRANSFERRED_NOTICES.some(function (notice) {
      return body.includes(notice);
    });

    return date !== null && untransferred ? [date] : [];
  });
}

// まとめに置き換わった普通の日の Daily のうち、ゴミ箱へ移すもの。
// 本文を写せなかった日は、元の Daily にしか本文が無いので残す。digest は週か月のまとめ（見出しから末尾まで）。
export function selectRetiredDailies(
  candidates: readonly DailyPage[],
  digest: string | null,
): readonly DailyPage[] {
  const untransferred = digest === null ? [] : listUntransferredDates(digest);

  return candidates.filter(function (daily) {
    return !untransferred.some(function (date) {
      return daily.isOn(date);
    });
  });
}

// 週のまとめの置き場（日曜の Daily）と、その週の見出し。
export interface WeeklyDigestPlace {
  readonly dailyId: string;
  readonly label: string;
}

// 月の中にある週のまとめの置き場。月末の Daily は月のまとめの置き場なので含めない。
export function listWeeklyDigestPlaces(
  month: DigestPeriod,
  dailies: readonly DailyPage[],
): readonly WeeklyDigestPlace[] {
  if (month.kind !== DIGEST_KIND.monthly) {
    return [];
  }

  return dailies
    .filter(function (daily) {
      return month.contains(daily.date);
    })
    .toSorted(compareDailies)
    .flatMap(function (daily) {
      const own = DigestPeriod.closingOn(daily.date);
      return own?.kind === DIGEST_KIND.weekly ? [{ dailyId: daily.id, label: own.label }] : [];
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

// 1 日分を写す元。ふつうは元の Daily から写し、元の Daily をゴミ箱へ移した日は週のまとめの節から写す。
export const TRANSFER_SOURCE = {
  dailies: "dailies",
  weeklyDigest: "weeklyDigest",
} as const;

// 1 日分を写す計画。heading は日付見出しで、転記済み判定の冪等キーになる。同じ日の Daily は 1 つの見出しの下へ並べる。
interface DailiesTransferPlan {
  readonly source: typeof TRANSFER_SOURCE.dailies;
  readonly date: Temporal.PlainDate;
  readonly heading: string;
  readonly dailyPageIds: readonly string[];
}

interface WeeklyDigestTransferPlan {
  readonly source: typeof TRANSFER_SOURCE.weeklyDigest;
  readonly date: Temporal.PlainDate;
  readonly heading: string;
  readonly body: string;
}

export type TransferPlan = DailiesTransferPlan | WeeklyDigestTransferPlan;

function addToPlans(plans: readonly DailiesTransferPlan[], daily: DailyPage): readonly DailiesTransferPlan[] {
  const last = plans.at(-1);

  if (last !== undefined && last.date.equals(daily.date)) {
    return plans.with(-1, { ...last, dailyPageIds: [...last.dailyPageIds, daily.id] });
  }

  return [
    ...plans,
    { source: TRANSFER_SOURCE.dailies, date: daily.date, heading: daily.expectedTitle, dailyPageIds: [daily.id] },
  ];
}

// まとめを書く締めの日の Daily と、その期間・まとめの状態。ロックは、期間の全日が転記されたときに限る。
// carried は、月のまとめへ写す週のまとめの節（その月の日曜の Daily から読む）。週のまとめでは空。
export class DigestTarget {
  constructor(
    readonly period: DigestPeriod,
    readonly closingDaily: DailyPage,
    readonly state: DigestState,
    readonly carried: readonly CarriedSection[] = [],
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

  // 週のまとめから写す節: 期間内で、元の Daily が無い日だけ。元の Daily がある日（本文を写せず残した日など）は
  // Daily から写す。
  private carriedIn(dailies: readonly DailyPage[]): readonly CarriedSection[] {
    const sources = this.sourcesIn(dailies);

    return this.carried.filter((section) => {
      return (
        this.period.contains(section.date) &&
        !sources.some(function (daily) {
          return daily.isOn(section.date);
        })
      );
    });
  }

  planTransfers(dailies: readonly DailyPage[]): readonly TransferPlan[] {
    const fromDailies = this.sourcesIn(dailies)
      .filter((daily) => {
        return !this.isTransferred(daily.date);
      })
      .reduce(addToPlans, []);
    const fromWeeklyDigests = this.carriedIn(dailies)
      .filter((section) => {
        return !this.isTransferred(section.date);
      })
      .map(function ({ date, heading, body }): WeeklyDigestTransferPlan {
        return { source: TRANSFER_SOURCE.weeklyDigest, date, heading, body };
      });

    return [...fromDailies, ...fromWeeklyDigests].toSorted(function (left, right) {
      return Temporal.PlainDate.compare(left.date, right.date);
    });
  }

  isComplete(dailies: readonly DailyPage[]): boolean {
    const dates = [
      ...this.sourcesIn(dailies).map(function ({ date }) {
        return date;
      }),
      ...this.carriedIn(dailies).map(function ({ date }) {
        return date;
      }),
    ];

    return dates.every((date) => {
      return this.isTransferred(date);
    });
  }

  // まとめを写し終えたら、期間の普通の日（日曜でも月末でもない日）の Daily はゴミ箱へ移す候補になる。
  // 週のまとめでは今月の終わった週の月〜土、月のまとめでは月の中の残り。日曜と月末の Daily は残す。
  // 写し終えるまでは候補にしない。
  listOrdinaryDailies(dailies: readonly DailyPage[]): readonly DailyPage[] {
    if (!this.isComplete(dailies)) {
      return [];
    }

    return this.sourcesIn(dailies).filter(function (daily) {
      return DigestPeriod.closingOn(daily.date) === null;
    });
  }

  // 月のまとめを写し終えたら、その月の日曜の Daily にある週のまとめを消す。
  // 写し終えるまでは消さない。消した日の本文が、どのまとめにも無い時間を作らないため。
  listReplacedWeeklyDigests(dailies: readonly DailyPage[]): readonly WeeklyDigestPlace[] {
    return this.isComplete(dailies) ? listWeeklyDigestPlaces(this.period, dailies) : [];
  }

  // まとめが揃ったら締めの日の Daily を閉じる。
  decideActions(dailies: readonly DailyPage[]): readonly PageAction[] {
    return !this.closingDaily.isLocked && this.isComplete(dailies)
      ? [{ type: PAGE_ACTION_TYPE.lock }]
      : [];
  }

  withHeader(): DigestTarget {
    return new DigestTarget(this.period, this.closingDaily, { ...this.state, hasHeader: true }, this.carried);
  }

  // 期間外の日は転記計画が作らないので、混入は不整合として失敗させる。
  withTransferred(date: Temporal.PlainDate): DigestTarget {
    if (!this.period.contains(date)) {
      throw new Error(`${this.label} の期間外の日付です: ${date.toString()}`);
    }

    return new DigestTarget(
      this.period,
      this.closingDaily,
      { ...this.state, transferredDates: [...this.state.transferredDates, date] },
      this.carried,
    );
  }

  withRefs(): DigestTarget {
    return new DigestTarget(this.period, this.closingDaily, { ...this.state, hasRefs: true }, this.carried);
  }
}
