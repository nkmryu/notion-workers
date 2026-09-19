import { describe, expect, it } from "vitest";

import {
  decideMonthlyPageAction,
  formatCalendarMonthTitle,
  getMonthlyPageMonth,
  parseMonthlyTitle,
  planMissingMonthlyPages,
  shouldLockMonthlyPage,
} from "./monthly-page";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("月次タイトル", () => {
  it("暦年とゼロ埋めした月を整形する", () => {
    // 月次タイトルが26.M01形式になることを保証する。
    expect(formatCalendarMonthTitle({ year: 2026, month: 1 })).toBe("26.M01");
  });

  it("タイトルを作成月より優先して解析する", () => {
    // インポート後もタイトルが示す暦月へMonthlyを帰属させることを保証する。
    expect(
      getMonthlyPageMonth({
        createdTime: "2026-07-01T00:00:00.000Z",
        currentTitle: "25.M12",
      }),
    ).toEqual({ year: 2025, month: 12 });
  });

  it("不正な月を解析しない", () => {
    // 月範囲外のタイトルを月識別に使わないことを保証する。
    expect(parseMonthlyTitle("26.M13", 2026)).toBeNull();
  });
});

describe("planMissingMonthlyPages", () => {
  const pages = [
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      currentTitle: "25.12.31（水）",
      isWeekly: false,
    },
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      currentTitle: "26.01.01（木）",
      isWeekly: false,
    },
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      currentTitle: "26.02.01（日）",
      isWeekly: false,
    },
  ];

  it("Dailyのタイトル日が属する月を古い順にすべて返す", () => {
    // 作成日と異なる暦月でも古い未作成月から残さず計画することを保証する。
    expect(planMissingMonthlyPages(pages, now)).toEqual([
      {
        month: { year: 2025, month: 12 },
        title: "25.M12",
        representativeCreatedTime: "2025-12-31T00:00:00.000Z",
      },
      {
        month: { year: 2026, month: 1 },
        title: "26.M01",
        representativeCreatedTime: "2026-01-01T00:00:00.000Z",
      },
      {
        month: { year: 2026, month: 2 },
        title: "26.M02",
        representativeCreatedTime: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("既存月を除外する", () => {
    // 既存Monthlyの月を重複作成しないことを保証する。
    expect(
      planMissingMonthlyPages(
        [
          ...pages,
          {
            createdTime: "2026-07-01T00:00:00.000Z",
            currentTitle: "25.M12",
            isWeekly: false,
            isMonthly: true,
          },
        ],
        now,
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.M01", "26.M02"]);
  });

  it("進行中の月はDailyがあっても作成しない", () => {
    // Monthly を月の終了後にまとめて作成・転記・Refs・ロックする前提で、今月のページを先に作らないことを保証する。
    expect(
      planMissingMonthlyPages(
        [
          ...pages,
          {
            createdTime: "2026-07-22T00:00:00.000Z",
            currentTitle: "26.07.01（水）",
            isWeekly: false,
          },
        ],
        now,
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["25.M12", "26.M01", "26.M02"]);
  });

  it("月が変わった初日に前月を作成対象にする", () => {
    // 翌月 1 日の実行で前月分が作られることを保証する。
    expect(
      planMissingMonthlyPages(
        [
          {
            createdTime: "2026-07-31T00:00:00.000Z",
            currentTitle: "26.07.31（金）",
            isWeekly: false,
          },
        ],
        new Date("2026-07-31T15:05:00.000Z"),
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.M07"]);
  });

  it("Dailyがない月は作成しない", () => {
    // Monthlyだけの月から別の作成対象を推測しないことを保証する。
    expect(
      planMissingMonthlyPages(
        [
          {
            createdTime: "2026-07-01T00:00:00.000Z",
            currentTitle: "26.M07",
            isWeekly: false,
            isMonthly: true,
          },
        ],
        now,
      ),
    ).toEqual([]);
  });
});

describe("月次アクション", () => {
  const monthly = {
    createdTime: "2026-06-01T00:00:00.000Z",
    currentTitle: "26.M06",
    isWeekly: false,
    isMonthly: true,
    isLocked: false,
  };
  const dailies = [
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      currentTitle: "26.06.01（月）",
      isWeekly: false,
    },
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      currentTitle: "26.06.02（火）",
      isWeekly: false,
    },
  ];

  it("全Daily見出しが揃った過去月をロックする", () => {
    // 終了月の全日が転記済みの場合だけロック可能になることを保証する。
    expect(
      shouldLockMonthlyPage(
        monthly,
        dailies,
        ["26.06.01（月）", "26.06.02（火）"],
        now,
      ),
    ).toBe(true);
    expect(decideMonthlyPageAction(monthly, now, true)).toEqual({
      type: "lock",
    });
  });

  it("未転記Dailyがある過去月をロックしない", () => {
    // 期待見出しが欠ける月を次回転記可能な状態に保つことを保証する。
    expect(
      shouldLockMonthlyPage(monthly, dailies, ["26.06.01（月）"], now),
    ).toBe(false);
  });

  it("今月は全見出しが揃ってもロックしない", () => {
    // 進行中の暦月を完了扱いしないことを保証する。
    expect(
      shouldLockMonthlyPage(
        { ...monthly, currentTitle: "26.M07" },
        [],
        [],
        now,
      ),
    ).toBe(false);
  });

  it("今月のMonthlyを期待タイトルへリネームする", () => {
    // テンプレートが上書きした月次タイトルを同じ実行で収束させることを保証する。
    expect(
      decideMonthlyPageAction(
        {
          ...monthly,
          currentTitle: "テンプレート",
          createdTime: "2026-07-01T00:00:00.000Z",
        },
        now,
      ),
    ).toEqual({ type: "rename", title: "26.M07" });
  });
});
