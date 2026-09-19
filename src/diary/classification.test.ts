import { describe, expect, it } from "vitest";

import { classifyPage, classifyPages } from "./classification";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("classifyPage", () => {
  it("日付タイトルを作成日ではなくタイトルの日のDailyとして分類する", () => {
    // インポートで作成日が偏っていてもタイトルが示す日を業務日として採用することを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-22T01:00:00.000Z",
          title: "24.12.30（月）",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ kind: "daily", dateKey: "2024-12-30" });
  });

  it("曜日表記が実際の曜日と異なっても日付部分からDailyと判定する", () => {
    // 曜日文字を日付同定の妥当性条件に含めないことを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-22T01:00:00.000Z",
          title: "26.07.22（火）",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ kind: "daily", dateKey: "2026-07-22" });
  });

  it("空でない非日付タイトルをメモとして分類する", () => {
    // ユーザーが付けたメモタイトルを日次処理へ混ぜないことを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          title: "買い物メモ",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ kind: "memo" });
  });

  it("typeがWeeklyなら日付タイトルでもWeeklyとして分類する", () => {
    // selectによる週次識別をタイトル形式より優先することを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          title: "26.07.20（月）",
          periodType: "weekly" as const,
        },
        now,
      ),
    ).toEqual({ kind: "weekly" });
  });

  it("typeがMonthlyなら日付タイトルでもMonthlyとして分類する", () => {
    // selectによる月次識別を日付タイトルより優先することを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          title: "26.07.20（月）",
          periodType: "monthly" as const,
        },
        now,
      ),
    ).toEqual({ kind: "monthly" });
  });

  it("今日作成された空タイトルを今日のDaily候補として分類する", () => {
    // テンプレート適用前の空タイトルでも今日の日次作成を重複させないことを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-21T15:00:00.000Z",
          title: "",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ kind: "daily", dateKey: "2026-07-22" });
  });

  it("今日作成でも空でない非日付タイトルはメモとして分類する", () => {
    // 今日作成という理由だけでユーザーのメモを日次リネーム対象にしないことを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-21T15:00:00.000Z",
          title: "今日のメモ",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ kind: "memo" });
  });
});

describe("classifyPages", () => {
  const pages = [
    {
      id: "daily",
      createdTime: "2026-07-22T01:00:00.000Z",
      title: "26.07.21（火）",
      isLocked: false,
      periodType: null,
    },
    {
      id: "today-candidate",
      createdTime: "2026-07-21T15:00:00.000Z",
      title: "",
      isLocked: false,
      periodType: null,
    },
    {
      id: "memo",
      createdTime: "2026-07-15T03:00:00.000Z",
      title: "週のメモ",
      isLocked: true,
      periodType: null,
    },
    {
      id: "weekly",
      createdTime: "2026-07-26T03:00:00.000Z",
      title: "26.W29",
      isLocked: false,
      periodType: "weekly" as const,
    },
    {
      id: "monthly",
      createdTime: "2026-07-01T00:00:00.000Z",
      title: "25.M12",
      isLocked: true,
      periodType: "monthly" as const,
    },
  ];

  it("Daily は日付キー付き、Weekly / Monthly は期間キー付きに分け、メモは落とす", () => {
    // 以降の処理が分類をやり直さず、種別ごとの一覧だけで判断できることを保証する。
    expect(classifyPages(pages, now)).toEqual({
      dailies: [
        {
          id: "daily",
          createdTime: "2026-07-22T01:00:00.000Z",
          title: "26.07.21（火）",
          isLocked: false,
          dateKey: "2026-07-21",
        },
        {
          id: "today-candidate",
          createdTime: "2026-07-21T15:00:00.000Z",
          title: "",
          isLocked: false,
          dateKey: "2026-07-22",
        },
      ],
      weeklies: [
        { id: "weekly", title: "26.W29", isLocked: false, key: { year: 2026, week: 29 } },
      ],
      monthlies: [
        { id: "monthly", title: "25.M12", isLocked: true, key: { year: 2025, month: 12 } },
      ],
    });
  });

  it("期間ページのキーはタイトルを作成日より優先し、読めなければ作成日から決める", () => {
    // インポート後もタイトルが示す期間へ帰属させ、テンプレート適用中の空タイトルは作成日で識別することを保証する。
    const { weeklies } = classifyPages(
      [
        {
          id: "titled",
          createdTime: "2026-07-26T03:00:00.000Z",
          title: "26.W29",
          isLocked: false,
          periodType: "weekly" as const,
        },
        {
          id: "untitled",
          createdTime: "2026-07-20T03:00:00.000Z",
          title: "",
          isLocked: false,
          periodType: "weekly" as const,
        },
      ],
      now,
    );

    expect(weeklies.map(function (page) { return page.key; })).toEqual([
      { year: 2026, week: 29 },
      { year: 2026, week: 30 },
    ]);
  });
});
