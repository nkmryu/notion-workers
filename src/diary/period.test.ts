import { describe, expect, it } from "vitest";

import type { DateKey } from "./jst-date";

import { parseDateKey } from "./jst-date";
import { monthly } from "./monthly";
import {
  decidePeriodPageAction,
  isFullyTransferred,
  planMissingPeriodPages,
} from "./period";
import { weekly } from "./weekly";

// 2026-07-22（水）= 26.W30 / 26.M07
const now = new Date("2026-07-22T03:00:00.000Z");

function daily(text: string): { readonly dateKey: DateKey } {
  return { dateKey: parseDateKey(text) };
}

function dateKeys(...texts: readonly string[]): readonly DateKey[] {
  return texts.map(parseDateKey);
}

describe("Weekly のアクション決定", () => {
  const lastWeek = {
    key: { year: 2026, week: 29 },
    title: "26.W29",
    isLocked: false,
    transferredDateKeys: dateKeys("2026-07-13", "2026-07-14"),
  };
  const lastWeekDailies = [daily("2026-07-13"), daily("2026-07-14")];

  it("今週の週次ページをリネームする", () => {
    // 今週の週次ページに期待する週次タイトルを指定することを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        { key: { year: 2026, week: 30 }, title: "新規ページ", isLocked: false, transferredDateKeys: [] },
        [],
        now,
      ),
    ).toEqual({ type: "rename", title: "26.W30" });
  });

  it("今週でリネーム済みの週次ページには何もしない", () => {
    // 進行中の週は転記が揃っていてもロックせず、不要な PATCH も重ねないことを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        {
          key: { year: 2026, week: 30 },
          title: "26.W30",
          isLocked: false,
          transferredDateKeys: dateKeys("2026-07-20"),
        },
        [daily("2026-07-20")],
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("先週の全 daily が転記済みなら未ロックの週次ページをロックする", () => {
    // 過去週の全日の転記が揃ったときだけ閉じることを保証する。
    expect(decidePeriodPageAction(weekly, lastWeek, lastWeekDailies, now)).toEqual({
      type: "lock",
    });
  });

  it("先週でも未転記の daily が残っていればロックしない", () => {
    // 1 日でも転記が欠けていれば次回転記可能な状態を保つことを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        { ...lastWeek, transferredDateKeys: dateKeys("2026-07-13") },
        lastWeekDailies,
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("タイトルが期待と違えばロック可能でもまずリネームする", () => {
    // テンプレートが上書きしたタイトルを、閉じる前に収束させることを保証する。
    expect(
      decidePeriodPageAction(weekly, { ...lastWeek, title: "" }, lastWeekDailies, now),
    ).toEqual({ type: "rename", title: "26.W29" });
  });

  it("ロック済みの週次ページには何もしない", () => {
    // ロック済みページへ PATCH を重ねないことを保証する。
    expect(
      decidePeriodPageAction(weekly, { ...lastWeek, isLocked: true }, lastWeekDailies, now),
    ).toEqual({ type: "none" });
  });

  it("未来週の週次ページには何もしない", () => {
    // 先に作られた未来週のページをリネームもロックもしないことを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        { key: { year: 2026, week: 31 }, title: "仮", isLocked: false, transferredDateKeys: [] },
        [],
        now,
      ),
    ).toEqual({ type: "none" });
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
        now,
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
        [{ key: { year: 2026, week: 28 } }],
        now,
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
        now,
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
        new Date("2026-07-26T17:00:00.000Z"),
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
        now,
      ),
    ).toEqual([{ key: { year: 2026, week: 29 }, title: "26.W29" }]);
  });

  it("daily が存在しない週は作成対象にしない", () => {
    // weekly だけがあるデータから別週のページを推測して作らないことを保証する。
    expect(
      planMissingPeriodPages(weekly, [], [{ key: { year: 2026, week: 28 } }], now),
    ).toEqual([]);
  });

  it("年末年始の daily を ISO 週基準年の週へ帰属させる", () => {
    // 暦年ではなく ISO 週基準年で週次ページを作ることを保証する。
    expect(planMissingPeriodPages(weekly, [daily("2024-12-30")], [], now)).toEqual([
      { key: { year: 2025, week: 1 }, title: "25.W01" },
    ]);
  });
});

describe("Weekly の転記完了判定", () => {
  const lastWeek = { key: { year: 2026, week: 29 }, transferredDateKeys: dateKeys("2026-07-13", "2026-07-14") };
  const dailies = [daily("2026-07-13"), daily("2026-07-14")];

  it("その週の全 daily が転記済みなら完了", () => {
    // 過去週の全日が転記済みのときだけ完了と判定することを保証する。
    expect(isFullyTransferred(weekly, lastWeek, dailies, now)).toBe(true);
  });

  it("未転記の daily が残る過去週は未完了", () => {
    // 1 日でも転記が欠けていれば未完了とすることを保証する。
    expect(
      isFullyTransferred(weekly, { ...lastWeek, transferredDateKeys: dateKeys("2026-07-13") }, dailies, now),
    ).toBe(false);
  });

  it("別の週の daily は完了条件に含めない", () => {
    // 他の週の未転記が対象週の完了判定を妨げないことを保証する。
    expect(isFullyTransferred(weekly, lastWeek, [...dailies, daily("2026-07-06")], now)).toBe(
      true,
    );
  });

  it("全 daily が転記済みでも今週は未完了", () => {
    // 進行中の週は転記数にかかわらず完了扱いしないことを保証する。
    expect(
      isFullyTransferred(
        weekly,
        { key: { year: 2026, week: 30 }, transferredDateKeys: dateKeys("2026-07-20") },
        [daily("2026-07-20")],
        now,
      ),
    ).toBe(false);
  });
});

describe("Monthly の作成計画", () => {
  const dailies = [daily("2025-12-31"), daily("2026-01-01"), daily("2026-02-01")];

  it("Daily の日が属する月を古い順にすべて返す", () => {
    // 古い未作成月から残さず計画することを保証する。
    expect(planMissingPeriodPages(monthly, dailies, [], now)).toEqual([
      { key: { year: 2025, month: 12 }, title: "25.M12" },
      { key: { year: 2026, month: 1 }, title: "26.M01" },
      { key: { year: 2026, month: 2 }, title: "26.M02" },
    ]);
  });

  it("既存月を除外する", () => {
    // 既存 Monthly の月を重複作成しないことを保証する。
    expect(
      planMissingPeriodPages(monthly, dailies, [{ key: { year: 2025, month: 12 } }], now).map(
        function (plan) {
          return plan.title;
        },
      ),
    ).toEqual(["26.M01", "26.M02"]);
  });

  it("進行中の月は Daily があっても作成しない", () => {
    // Monthly を月の終了後にまとめて作成・転記・Refs・ロックする前提で、今月のページを先に作らないことを保証する。
    expect(
      planMissingPeriodPages(monthly, [...dailies, daily("2026-07-01")], [], now).map(
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
        new Date("2026-07-31T17:00:00.000Z"),
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.M07"]);
  });

  it("Daily がない月は作成しない", () => {
    // Monthly だけの月から別の作成対象を推測しないことを保証する。
    expect(
      planMissingPeriodPages(monthly, [], [{ key: { year: 2026, month: 7 } }], now),
    ).toEqual([]);
  });
});

describe("Monthly のアクション決定", () => {
  const lastMonth = {
    key: { year: 2026, month: 6 },
    title: "26.M06",
    isLocked: false,
    transferredDateKeys: dateKeys("2026-06-01", "2026-06-02"),
  };
  const dailies = [daily("2026-06-01"), daily("2026-06-02")];

  it("全 Daily が転記済みの過去月をロックする", () => {
    // 終了月の全日が転記済みの場合だけ閉じることを保証する。
    expect(decidePeriodPageAction(monthly, lastMonth, dailies, now)).toEqual({ type: "lock" });
  });

  it("未転記 Daily がある過去月をロックしない", () => {
    // 転記が欠ける月を次回転記可能な状態に保つことを保証する。
    expect(
      decidePeriodPageAction(
        monthly,
        { ...lastMonth, transferredDateKeys: dateKeys("2026-06-01") },
        dailies,
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("今月の Monthly を期待タイトルへリネームする", () => {
    // テンプレートが上書きした月次タイトルを同じ実行で収束させることを保証する。
    expect(
      decidePeriodPageAction(
        monthly,
        { key: { year: 2026, month: 7 }, title: "テンプレート", isLocked: false, transferredDateKeys: [] },
        [],
        now,
      ),
    ).toEqual({ type: "rename", title: "26.M07" });
  });
});
