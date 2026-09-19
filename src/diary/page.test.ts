import { describe, expect, it } from "vitest";

import { PAGE_KIND, PERIOD_TYPE, classifyPage } from "./page";
import { PAGE_ACTION_TYPE } from "./daily";

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

describe("状態・種別の値", () => {
  it.each([
    ["PERIOD_TYPE", PERIOD_TYPE],
    ["PAGE_KIND", PAGE_KIND],
    ["PAGE_ACTION_TYPE", PAGE_ACTION_TYPE],
  ])("%s の値は snake_case の文字列で、キーと一致する", (_name, values) => {
    // ログや Notion の select 名との突き合わせで読めるよう、値が snake_case の機械トークンであることを保証する。
    for (const [key, value] of Object.entries(values)) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(value).toBe(key);
    }
  });

  it("PAGE_KIND は PERIOD_TYPE を含む", () => {
    // 期間ページの分類結果が periodType の値と同じ語彙であることを保証する。
    expect(PAGE_KIND).toMatchObject(PERIOD_TYPE);
  });
});
