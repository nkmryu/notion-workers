import { describe, expect, it } from "vitest";

import { shouldCreateTodayPage } from "./page-creation";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("shouldCreateTodayPage", () => {
  it("タイトルの日が今日のDailyが存在すれば作成しない", () => {
    // 作成日が異なっても今日の日付タイトルがあれば重複作成しないことを保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2024-01-01T00:00:00.000Z",
            currentTitle: "26.07.22（水）",
            isWeekly: false,
          },
        ],
        now,
      ),
    ).toBe(false);
  });

  it("過去日のDailyだけなら今日のページを作成する", () => {
    // 作成日ではなくタイトルの日を今日の存在判定に使うことを保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2026-07-22T01:00:00.000Z",
            currentTitle: "26.07.21（火）",
            isWeekly: false,
          },
        ],
        now,
      ),
    ).toBe(true);
  });

  it("ページが0件なら今日のページを作成する", () => {
    // 空のデータソースでも今日の日次ページを作成できることを保証する。
    expect(shouldCreateTodayPage([], now)).toBe(true);
  });

  it("今日作成された空タイトルをDaily候補として数える", () => {
    // JSTの日付境界以降に作られた空ページによる重複作成防止を保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2026-07-21T15:00:00.000Z",
            currentTitle: "",
            isWeekly: false,
          },
        ],
        now,
      ),
    ).toBe(false);
  });

  it("空タイトルの作成日はUTC 15:00をJST日付境界として判定する", () => {
    // 境界直前の空ページは過去、境界以降の空ページは今日のDaily候補になることを保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2026-07-21T14:59:59.999Z",
            currentTitle: "",
            isWeekly: false,
          },
        ],
        now,
      ),
    ).toBe(true);
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2026-07-21T15:00:00.000Z",
            currentTitle: "",
            isWeekly: false,
          },
        ],
        now,
      ),
    ).toBe(false);
  });

  it("今日作成でも非日付タイトルのメモはDailyとして数えない", () => {
    // 今日のメモが日次ページ作成を抑止しないことを保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2026-07-22T01:00:00.000Z",
            currentTitle: "今日のメモ",
            isWeekly: false,
          },
        ],
        now,
      ),
    ).toBe(true);
  });

  it("今日作成された週次ページだけなら日次ページを作成する", () => {
    // 週次ページの存在が今日の日次ページ作成を抑止しないことを保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2026-07-22T03:00:00.000Z",
            currentTitle: "26.W30",
            isWeekly: true,
          },
        ],
        now,
      ),
    ).toBe(true);
  });

  it("今日の日付風タイトルを持つMonthlyだけなら日次ページを作成する", () => {
    // Monthlyの存在が今日のDaily作成を抑止しないことを保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2026-07-22T03:00:00.000Z",
            currentTitle: "26.07.22（水）",
            isWeekly: false,
            isMonthly: true,
          },
        ],
        now,
      ),
    ).toBe(true);
  });
});
