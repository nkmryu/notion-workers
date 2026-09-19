import { describe, expect, it } from "vitest";

import { monthly } from "./monthly";
import {
  decidePeriodPageAction,
  planMissingPeriodPages,
  shouldLockPeriodPage,
} from "./period";
import { weekly } from "./weekly";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("Weekly のアクション決定", () => {
  it("今週作成された週次ページをリネームする", () => {
    // 今週の週次ページに期待する週次タイトルを指定することを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          title: "新規ページ",
          periodType: "weekly" as const,
        },
        now,
        false,
      ),
    ).toEqual({ type: "rename", title: "26.W30" });
  });

  it("今週作成されてリネーム済みの週次ページには何もしない", () => {
    // 週次ページへ不要な PATCH を重ねないことを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          title: "26.W30",
          periodType: "weekly" as const,
        },
        now,
        false,
      ),
    ).toEqual({ type: "none" });
  });

  it("先週作成された未ロックの週次ページをロックする", () => {
    // 転記完了が確認された過去週だけをロック対象にできることを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        {
          createdTime: "2026-07-13T03:00:00.000Z",
          isLocked: false,
          title: "26.W29",
          periodType: "weekly" as const,
        },
        now,
        true,
      ),
    ).toEqual({ type: "lock" });
  });

  it("先週でも転記が完了していなければロックしない", () => {
    // 過去週という条件だけで未完了の週次ページを閉じないことを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        {
          createdTime: "2026-07-13T03:00:00.000Z",
          isLocked: false,
          title: "26.W29",
          periodType: "weekly" as const,
        },
        now,
        false,
      ),
    ).toEqual({ type: "none" });
  });

  it("日次ページには何もしない", () => {
    // 日次ページを週次のリネーム・ロック対象にしないことを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        {
          createdTime: "2026-07-13T03:00:00.000Z",
          isLocked: false,
          title: "26.07.13（月）",
          periodType: null,
        },
        now,
        false,
      ),
    ).toEqual({ type: "none" });
  });

  it("未来週に作成された週次ページには何もしない", () => {
    // 実行時点より未来の ISO 週に属するページを変更しないことを保証する。
    expect(
      decidePeriodPageAction(
        weekly,
        {
          createdTime: "2026-07-27T03:00:00.000Z",
          isLocked: false,
          title: "26.W31",
          periodType: "weekly" as const,
        },
        now,
        false,
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
        [
          {
            createdTime: "2026-07-13T03:00:00.000Z",
            periodType: null,
            title: "26.07.13（月）",
          },
          {
            createdTime: "2026-06-29T03:00:00.000Z",
            periodType: null,
            title: "26.06.29（月）",
          },
          {
            createdTime: "2026-07-06T03:00:00.000Z",
            periodType: null,
            title: "26.07.06（月）",
          },
        ],
        now,
      ),
    ).toEqual([
      {
        key: { year: 2026, week: 27 },
        title: "26.W27",
        representativeCreatedTime: "2026-06-29T00:00:00.000Z",
      },
      {
        key: { year: 2026, week: 28 },
        title: "26.W28",
        representativeCreatedTime: "2026-07-06T00:00:00.000Z",
      },
      {
        key: { year: 2026, week: 29 },
        title: "26.W29",
        representativeCreatedTime: "2026-07-13T00:00:00.000Z",
      },
    ]);
  });

  it("weekly が既にある週は作成対象から除外する", () => {
    // タイトルが示す ISO 週に weekly があれば重複作成しないことを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [
          {
            createdTime: "2026-07-06T03:00:00.000Z",
            periodType: null,
            title: "26.07.06（月）",
          },
          {
            createdTime: "2026-07-18T03:00:00.000Z",
            periodType: "weekly" as const,
            title: "26.W28",
          },
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("進行中の週は daily があっても作成対象にしない", () => {
    // Weekly を週の終了後にまとめて作成・転記・ロックする前提で、今週のページを先に作らないことを保証する。
    // now は 2026-07-22（水）= 26.W30。
    expect(
      planMissingPeriodPages(
        weekly,
        [
          {
            createdTime: "2026-07-20T03:00:00.000Z",
            periodType: null,
            title: "26.07.20（月）",
          },
          {
            createdTime: "2026-07-22T03:00:00.000Z",
            periodType: null,
            title: "26.07.22（水）",
          },
          {
            createdTime: "2026-07-19T03:00:00.000Z",
            periodType: null,
            title: "26.07.19（日）",
          },
        ],
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
        [
          {
            createdTime: "2026-07-26T03:00:00.000Z",
            periodType: null,
            title: "26.07.26（日）",
          },
          {
            createdTime: "2026-07-27T03:00:00.000Z",
            periodType: null,
            title: "26.07.27（月）",
          },
        ],
        new Date("2026-07-26T15:05:00.000Z"),
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.W30"]);
  });

  it("daily が存在しない週は作成対象にしない", () => {
    // weekly だけがあるデータから別週のページを推測して作らないことを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [
          {
            createdTime: "2026-07-18T03:00:00.000Z",
            periodType: "weekly" as const,
            title: "26.W29",
          },
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("MonthlyをDailyとして週次作成の根拠にしない", () => {
    // 日付風タイトルのMonthlyがWeekly作成を誘発しないことを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [
          {
            createdTime: "2026-07-18T03:00:00.000Z",
            periodType: "monthly" as const,
            title: "26.07.13（月）",
          },
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("作成日と異なるタイトルの日のISO週へdailyを帰属させる", () => {
    // インポート時の作成日に偏らずタイトル日が属する過去週を作成対象にすることを保証する。
    expect(
      planMissingPeriodPages(
        weekly,
        [
          {
            createdTime: "2026-07-22T01:00:00.000Z",
            periodType: null,
            title: "24.12.30（月）",
          },
          {
            createdTime: "2024-12-30T01:00:00.000Z",
            periodType: null,
            title: "移行メモ",
          },
        ],
        now,
      ),
    ).toEqual([
      {
        key: { year: 2025, week: 1 },
        title: "25.W01",
        representativeCreatedTime: "2024-12-30T00:00:00.000Z",
      },
    ]);
  });
});

describe("Weekly のロック判定", () => {
  const weeklyPage = {
    createdTime: "2026-07-13T00:00:00.000Z",
    isLocked: false,
    title: "26.W29",
    periodType: "weekly" as const,
  };
  const dailies = [
    {
      createdTime: "2026-07-13T03:00:00.000Z",
      title: "26.07.13（月）",
      periodType: null,
    },
    {
      createdTime: "2026-07-14T03:00:00.000Z",
      title: "26.07.14（火）",
      periodType: null,
    },
  ];

  it("その週の全 daily が転記済みなら過去週をロックする", () => {
    // 過去週の全期待見出しが存在するときだけ完了と判定することを保証する。
    expect(
      shouldLockPeriodPage(
        weekly,
        weeklyPage,
        dailies,
        ["26.07.13（月）", "26.07.14（火）"],
        now,
      ),
    ).toBe(true);
  });

  it("未転記の daily が残る過去週をロックしない", () => {
    // 1日でも期待見出しが欠けていれば次回転記可能な状態を保つことを保証する。
    expect(
      shouldLockPeriodPage(weekly, weeklyPage, dailies, ["26.07.13（月）"], now),
    ).toBe(false);
  });

  it("全 daily が転記済みでも今週はロックしない", () => {
    // 進行中の週は転記完了数にかかわらず閉じないことを保証する。
    expect(
      shouldLockPeriodPage(
        weekly,
        {
          ...weeklyPage,
          createdTime: "2026-07-20T00:00:00.000Z",
          title: "26.W30",
        },
        [
          {
            createdTime: "2026-07-20T03:00:00.000Z",
            title: "26.07.20（月）",
            periodType: null,
          },
        ],
        ["26.07.20（月）"],
        now,
      ),
    ).toBe(false);
  });

  it("同じ週のロック済みメモを完了条件へ含めない", () => {
    // メモに対応する見出しがなくても全Daily転記済みなら週次をロックできることを保証する。
    expect(
      shouldLockPeriodPage(
        weekly,
        weeklyPage,
        [
          ...dailies,
          {
            createdTime: "2026-07-15T03:00:00.000Z",
            title: "週のメモ",
            periodType: null,
          },
        ],
        ["26.07.13（月）", "26.07.14（火）"],
        now,
      ),
    ).toBe(true);
  });
});

describe("Monthly の作成計画", () => {
  const pages = [
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      title: "25.12.31（水）",
      periodType: null,
    },
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      title: "26.01.01（木）",
      periodType: null,
    },
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      title: "26.02.01（日）",
      periodType: null,
    },
  ];

  it("Dailyのタイトル日が属する月を古い順にすべて返す", () => {
    // 作成日と異なる暦月でも古い未作成月から残さず計画することを保証する。
    expect(planMissingPeriodPages(monthly, pages, now)).toEqual([
      {
        key: { year: 2025, month: 12 },
        title: "25.M12",
        representativeCreatedTime: "2025-12-31T00:00:00.000Z",
      },
      {
        key: { year: 2026, month: 1 },
        title: "26.M01",
        representativeCreatedTime: "2026-01-01T00:00:00.000Z",
      },
      {
        key: { year: 2026, month: 2 },
        title: "26.M02",
        representativeCreatedTime: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("既存月を除外する", () => {
    // 既存Monthlyの月を重複作成しないことを保証する。
    expect(
      planMissingPeriodPages(
        monthly,
        [
          ...pages,
          {
            createdTime: "2026-07-01T00:00:00.000Z",
            title: "25.M12",
            periodType: "monthly" as const,
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
      planMissingPeriodPages(
        monthly,
        [
          ...pages,
          {
            createdTime: "2026-07-22T00:00:00.000Z",
            title: "26.07.01（水）",
            periodType: null,
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
      planMissingPeriodPages(
        monthly,
        [
          {
            createdTime: "2026-07-31T00:00:00.000Z",
            title: "26.07.31（金）",
            periodType: null,
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
      planMissingPeriodPages(
        monthly,
        [
          {
            createdTime: "2026-07-01T00:00:00.000Z",
            title: "26.M07",
            periodType: "monthly" as const,
          },
        ],
        now,
      ),
    ).toEqual([]);
  });
});

describe("Monthly のアクション決定とロック判定", () => {
  const monthlyPage = {
    createdTime: "2026-06-01T00:00:00.000Z",
    title: "26.M06",
    periodType: "monthly" as const,
    isLocked: false,
  };
  const dailies = [
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      title: "26.06.01（月）",
      periodType: null,
    },
    {
      createdTime: "2026-07-22T00:00:00.000Z",
      title: "26.06.02（火）",
      periodType: null,
    },
  ];

  it("全Daily見出しが揃った過去月をロックする", () => {
    // 終了月の全日が転記済みの場合だけロック可能になることを保証する。
    expect(
      shouldLockPeriodPage(
        monthly,
        monthlyPage,
        dailies,
        ["26.06.01（月）", "26.06.02（火）"],
        now,
      ),
    ).toBe(true);
    expect(decidePeriodPageAction(monthly, monthlyPage, now, true)).toEqual({
      type: "lock",
    });
  });

  it("未転記Dailyがある過去月をロックしない", () => {
    // 期待見出しが欠ける月を次回転記可能な状態に保つことを保証する。
    expect(
      shouldLockPeriodPage(monthly, monthlyPage, dailies, ["26.06.01（月）"], now),
    ).toBe(false);
  });

  it("今月は全見出しが揃ってもロックしない", () => {
    // 進行中の暦月を完了扱いしないことを保証する。
    expect(
      shouldLockPeriodPage(
        monthly,
        { ...monthlyPage, title: "26.M07" },
        [],
        [],
        now,
      ),
    ).toBe(false);
  });

  it("今月のMonthlyを期待タイトルへリネームする", () => {
    // テンプレートが上書きした月次タイトルを同じ実行で収束させることを保証する。
    expect(
      decidePeriodPageAction(
        monthly,
        {
          ...monthlyPage,
          title: "テンプレート",
          createdTime: "2026-07-01T00:00:00.000Z",
        },
        now,
        false,
      ),
    ).toEqual({ type: "rename", title: "26.M07" });
  });
});
