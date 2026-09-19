import { describe, expect, it } from "vitest";

import { classifyPage } from "./page";

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
