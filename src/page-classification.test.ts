import { describe, expect, it } from "vitest";

import { classifyPage } from "./page-classification";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("classifyPage", () => {
  it("日付タイトルを作成日ではなくタイトルの日のDailyとして分類する", () => {
    // インポートで作成日が偏っていてもタイトルが示す日を業務日として採用することを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-22T01:00:00.000Z",
          currentTitle: "24.12.30（月）",
          isWeekly: false,
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
          currentTitle: "26.07.22（火）",
          isWeekly: false,
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
          currentTitle: "買い物メモ",
          isWeekly: false,
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
          currentTitle: "26.07.20（月）",
          isWeekly: true,
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
          currentTitle: "26.07.20（月）",
          isWeekly: false,
          isMonthly: true,
        },
        now,
      ),
    ).toEqual({ kind: "monthly" });
  });

  it("WeeklyとMonthlyの両方ならWeeklyを優先する", () => {
    // 壊れた入力でも指定された分類優先順位を維持することを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          currentTitle: "26.M07",
          isWeekly: true,
          isMonthly: true,
        },
        now,
      ),
    ).toEqual({ kind: "weekly" });
  });

  it("今日作成された空タイトルを今日のDaily候補として分類する", () => {
    // テンプレート適用前の空タイトルでも今日の日次作成を重複させないことを保証する。
    expect(
      classifyPage(
        {
          createdTime: "2026-07-21T15:00:00.000Z",
          currentTitle: "",
          isWeekly: false,
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
          currentTitle: "今日のメモ",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ kind: "memo" });
  });
});
