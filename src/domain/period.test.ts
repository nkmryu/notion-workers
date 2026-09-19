import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";


import { DailyPage, formatDailyTitle } from "./daily";
import { monthly } from "./monthly";
import type { PeriodArchiveProps, PeriodDefinition } from "./period";

import { PeriodArchive, PeriodPage, planMissingPeriodPages } from "./period";
import { weekly } from "./weekly";

// 2026-07-22（水）= 26.W30 / 26.M07
const today = Temporal.PlainDate.from("2026-07-22");

function daily(text: string): DailyPage {
  const date = Temporal.PlainDate.from(text);
  return new DailyPage({
    id: `daily-${text}`,
    createdTime: "2026-01-01T00:00:00.000Z",
    title: formatDailyTitle(date),
    isLocked: false,
    date,
  });
}

// 検証に関係ない項目は既定値で埋める。title は既定で期待タイトルにし、リネーム判定のテストだけ上書きする。
function archive<K>(
  period: PeriodDefinition<K>,
  props: Partial<PeriodArchiveProps<K>> & { readonly key: K },
): PeriodArchive<K> {
  return new PeriodArchive(period, {
    id: `${period.type}-${period.formatTitle(props.key)}`,
    title: period.formatTitle(props.key),
    isLocked: false,
    transferredDates: [],
    hasRefs: false,
    ...props,
  });
}

function week(year: number, week: number): PeriodPage<{ year: number; week: number }> {
  return new PeriodPage(weekly, { id: `weekly-${year}-${week}`, title: "", isLocked: false, key: { year, week } });
}

function month(year: number, monthNumber: number): PeriodPage<Temporal.PlainYearMonth> {
  return new PeriodPage(monthly, {
    id: `monthly-${year}-${monthNumber}`,
    title: "",
    isLocked: false,
    key: Temporal.PlainYearMonth.from({ year, month: monthNumber }),
  });
}

function dates(...texts: readonly string[]): readonly Temporal.PlainDate[] {
  return texts.map(function (text) {
    return Temporal.PlainDate.from(text);
  });
}

describe("Weekly のアクション決定", () => {
  const lastWeek = {
    key: { year: 2026, week: 29 },
    title: "26.W29",
    isLocked: false,
    transferredDates: dates("2026-07-13", "2026-07-14"),
  };
  const lastWeekDailies = [daily("2026-07-13"), daily("2026-07-14")];

  it("今週の週次ページをリネームする", () => {
    // 今週の週次ページに期待する週次タイトルを指定することを保証する。
    expect(
      archive(weekly, { key: { year: 2026, week: 30 }, title: "新規ページ", isLocked: false, transferredDates: [] }).decideActions([], today),
    ).toEqual([{ type: "rename", title: "26.W30" }]);
  });

  it("今週でリネーム済みの週次ページには何もしない", () => {
    // 進行中の週は転記が揃っていてもロックせず、不要な PATCH も重ねないことを保証する。
    expect(
      archive(weekly, {
          key: { year: 2026, week: 30 },
          title: "26.W30",
          isLocked: false,
          transferredDates: dates("2026-07-20"),
        }).decideActions([daily("2026-07-20")], today),
    ).toEqual([]);
  });

  it("先週の全 daily が転記済みなら未ロックの週次ページをロックする", () => {
    // 過去週の全日の転記が揃ったときだけ閉じることを保証する。
    expect(archive(weekly, lastWeek).decideActions(lastWeekDailies, today)).toEqual([{ type: "lock" }]);
  });

  it("先週でも未転記の daily が残っていればロックしない", () => {
    // 1 日でも転記が欠けていれば次回転記可能な状態を保つことを保証する。
    expect(
      archive(weekly, { ...lastWeek, transferredDates: dates("2026-07-13") }).decideActions(lastWeekDailies, today),
    ).toEqual([]);
  });

  it("作成直後の空タイトルでも、同じ実行でリネームしてから閉じる", () => {
    // 週が変わった最初の実行で「作成 → 転記 → リネーム → ロック」まで一度に進むことを保証する。
    expect(
      archive(weekly, { ...lastWeek, title: "" }).decideActions(lastWeekDailies, today),
    ).toEqual([{ type: "rename", title: "26.W29" }, { type: "lock" }]);
  });

  it("ロック済みの週次ページには何もしない", () => {
    // ロック済みページへ PATCH を重ねないことを保証する。
    expect(
      archive(weekly, { ...lastWeek, isLocked: true }).decideActions(lastWeekDailies, today),
    ).toEqual([]);
  });

  it("未来週の週次ページには何もしない", () => {
    // 先に作られた未来週のページをリネームもロックもしないことを保証する。
    expect(
      archive(weekly, { key: { year: 2026, week: 31 }, title: "仮", isLocked: false, transferredDates: [] }).decideActions([], today),
    ).toEqual([]);
  });
});

describe("Weekly の作成計画", () => {
  it("weekly が無い daily の週を古い順にすべて返す", () => {
    // 未作成の過去週が複数あっても1回の実行で残さず作成対象にすることを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [daily("2026-07-13"), daily("2026-06-29"), daily("2026-07-06")],
        [],
        today,
      ),
    ).toEqual([
      { key: { year: 2026, week: 27 }, title: "26.W27" },
      { key: { year: 2026, week: 28 }, title: "26.W28" },
      { key: { year: 2026, week: 29 }, title: "26.W29" },
    ]);
  });

  it("weekly が既にある週は作成対象から除外する", () => {
    // その ISO 週に weekly があれば重複作成しないことを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [daily("2026-07-06")],
        [week(2026, 28)],
        today,
      ),
    ).toEqual([]);
  });

  it("進行中の週は daily があっても作成対象にしない", () => {
    // Weekly を週の終了後にまとめて作成・転記・ロックする前提で、今週のページを先に作らないことを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [daily("2026-07-20"), daily("2026-07-22"), daily("2026-07-19")],
        [],
        today,
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.W29"]);
  });

  it("週が変わった初日に前週を作成対象にする", () => {
    // 新しい週の最初の実行で前週分が作られ、同じ実行で転記とロックまで進めることを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [daily("2026-07-26"), daily("2026-07-27")],
        [],
        Temporal.PlainDate.from("2026-07-27"),
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.W30"]);
  });

  it("同じ週の daily が複数あっても計画は 1 件にまとめる", () => {
    // 週内の日数に関係なく週次ページを 1 つだけ作ることを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [daily("2026-07-13"), daily("2026-07-14"), daily("2026-07-19")],
        [],
        today,
      ),
    ).toEqual([{ key: { year: 2026, week: 29 }, title: "26.W29" }]);
  });

  it("daily が存在しない週は作成対象にしない", () => {
    // weekly だけがあるデータから別週のページを推測して作らないことを保証する。
    expect(
      planMissingPeriodPages(weekly, [], [week(2026, 28)], today),
    ).toEqual([]);
  });

  it("年末年始の daily を ISO 週基準年の週へ帰属させる", () => {
    // 暦年ではなく ISO 週基準年で週次ページを作ることを保証する。
    expect(planMissingPeriodPages(weekly, [daily("2024-12-30")], [], today)).toEqual([
      { key: { year: 2025, week: 1 }, title: "25.W01" },
    ]);
  });
});

describe("Weekly の転記完了判定", () => {
  const lastWeek = { key: { year: 2026, week: 29 }, transferredDates: dates("2026-07-13", "2026-07-14") };
  const dailies = [daily("2026-07-13"), daily("2026-07-14")];

  it("その週の全 daily が転記済みなら完了", () => {
    // 過去週の全日が転記済みのときだけ完了と判定することを保証する。
    expect(archive(weekly, lastWeek).isFullyTransferred(dailies, today)).toBe(true);
  });

  it("未転記の daily が残る過去週は未完了", () => {
    // 1 日でも転記が欠けていれば未完了とすることを保証する。
    expect(
      archive(weekly, { ...lastWeek, transferredDates: dates("2026-07-13") }).isFullyTransferred(dailies, today),
    ).toBe(false);
  });

  it("別の週の daily は完了条件に含めない", () => {
    // 他の週の未転記が対象週の完了判定を妨げないことを保証する。
    expect(archive(weekly, lastWeek).isFullyTransferred([...dailies, daily("2026-07-06")], today)).toBe(
      true,
    );
  });

  it("全 daily が転記済みでも今週は未完了", () => {
    // 進行中の週は転記数にかかわらず完了扱いしないことを保証する。
    expect(
      archive(weekly, { key: { year: 2026, week: 30 }, transferredDates: dates("2026-07-20") }).isFullyTransferred([daily("2026-07-20")], today),
    ).toBe(false);
  });
});

describe("Monthly の作成計画", () => {
  const dailies = [daily("2025-12-31"), daily("2026-01-01"), daily("2026-02-01")];

  it("Daily の日が属する月を古い順にすべて返す", () => {
    // 古い未作成月から残さず計画することを保証する。
    expect(planMissingPeriodPages(monthly, dailies, [], today)).toEqual([
      { key: Temporal.PlainYearMonth.from({ year: 2025, month: 12 }), title: "25.M12" },
      { key: Temporal.PlainYearMonth.from({ year: 2026, month: 1 }), title: "26.M01" },
      { key: Temporal.PlainYearMonth.from({ year: 2026, month: 2 }), title: "26.M02" },
    ]);
  });

  it("既存月を除外する", () => {
    // 既存 Monthly の月を重複作成しないことを保証する。
    expect(
      planMissingPeriodPages(monthly, dailies, [month(2025, 12)], today).map(
        function (plan) {
          return plan.title;
        },
      ),
    ).toEqual(["26.M01", "26.M02"]);
  });

  it("進行中の月は Daily があっても作成しない", () => {
    // Monthly を月の終了後にまとめて作成・転記・Refs・ロックする前提で、今月のページを先に作らないことを保証する。
    expect(
      planMissingPeriodPages(monthly, [...dailies, daily("2026-07-01")], [], today).map(
        function (plan) {
          return plan.title;
        },
      ),
    ).toEqual(["25.M12", "26.M01", "26.M02"]);
  });

  it("月が変わった初日に前月を作成対象にする", () => {
    // 翌月 1 日の実行で前月分が作られることを保証する。
    expect(
      planMissingPeriodPages(
        monthly,
        [daily("2026-07-31")],
        [],
        Temporal.PlainDate.from("2026-08-01"),
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.M07"]);
  });

  it("Daily がない月は作成しない", () => {
    // Monthly だけの月から別の作成対象を推測しないことを保証する。
    expect(
      planMissingPeriodPages(monthly, [], [month(2026, 7)], today),
    ).toEqual([]);
  });
});

describe("Monthly のアクション決定", () => {
  const lastMonth = {
    key: Temporal.PlainYearMonth.from({ year: 2026, month: 6 }),
    title: "26.M06",
    isLocked: false,
    transferredDates: dates("2026-06-01", "2026-06-02"),
  };
  const dailies = [daily("2026-06-01"), daily("2026-06-02")];

  it("全 Daily が転記済みの過去月をロックする", () => {
    // 終了月の全日が転記済みの場合だけ閉じることを保証する。
    expect(archive(monthly, lastMonth).decideActions(dailies, today)).toEqual([{ type: "lock" }]);
  });

  it("未転記 Daily がある過去月をロックしない", () => {
    // 転記が欠ける月を次回転記可能な状態に保つことを保証する。
    expect(
      archive(monthly, { ...lastMonth, transferredDates: dates("2026-06-01") }).decideActions(dailies, today),
    ).toEqual([]);
  });

  it("今月の Monthly を期待タイトルへリネームする", () => {
    // テンプレートが上書きした月次タイトルを同じ実行で収束させることを保証する。
    expect(
      archive(monthly, { key: Temporal.PlainYearMonth.from({ year: 2026, month: 7 }), title: "テンプレート", isLocked: false, transferredDates: [] }).decideActions([], today),
    ).toEqual([{ type: "rename", title: "26.M07" }]);
  });
});
