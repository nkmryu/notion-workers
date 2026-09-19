import { describe, expect, it } from "vitest";

import { decideDailyPageAction, shouldCreateTodayPage } from "./daily";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("Daily のアクション決定", () => {
  it("今日作成された空タイトルのDaily候補をリネームする", () => {
    // テンプレート適用前の空ページへ今日の日次タイトルを付けることを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2026-07-21T15:00:00.000Z",
          isLocked: false,
          title: "",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "rename", title: "26.07.22（水）" });
  });

  it("今日の日付で曜日だけ異なるDailyを期待タイトルへ直す", () => {
    // 曜日を日付同定には使わず、今日の日次タイトルの整形では正しい曜日へ直すことを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2024-01-01T00:00:00.000Z",
          isLocked: false,
          title: "26.07.22（火）",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "rename", title: "26.07.22（水）" });
  });

  it("今日の日付でリネーム済みのDailyには何もしない", () => {
    // 同じ入力で再実行しても不要なタイトル更新を行わないことを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2024-01-01T00:00:00.000Z",
          isLocked: false,
          title: "26.07.22（水）",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("今日作成でも非日付タイトルのメモはリネームしない", () => {
    // ユーザーが付けたメモタイトルを今日の日次タイトルで上書きしないことを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2026-07-22T10:00:00.000Z",
          isLocked: false,
          title: "今日のメモ",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("タイトルの日が過去の未ロックDailyをロックする", () => {
    // 作成日が今日でもタイトルの日が過去なら終了済み日次として扱うことを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2026-07-22T01:00:00.000Z",
          isLocked: false,
          title: "24.12.30（月）",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "lock" });
  });

  it("過去作成の未ロックメモをロックしない", () => {
    // 日付タイトルでないページを日次ロック対象へ含めないことを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2024-12-30T03:00:00.000Z",
          isLocked: false,
          title: "振り返りメモ",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("過去日のロック済みDailyには何もしない", () => {
    // ロック済みページへ重複PATCHしないことを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2026-07-22T01:00:00.000Z",
          isLocked: true,
          title: "26.07.20（月）",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("未来の日付タイトルには何もしない", () => {
    // タイトルの日が未来のDailyを誤って変更しないことを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          title: "26.07.23（木）",
          periodType: null,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("週次ページを日次アクションの対象にしない", () => {
    // 日付形式のタイトルでもtypeがWeeklyなら日次処理から除外することを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          title: "26.07.20（月）",
          periodType: "weekly" as const,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("月次ページを日次アクションの対象にしない", () => {
    // 日付形式のタイトルでもtypeがMonthlyなら日次リネームとロックから除外することを保証する。
    expect(
      decideDailyPageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          title: "26.07.20（月）",
          periodType: "monthly" as const,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });
});

describe("今日の Daily の作成判定", () => {
  it("タイトルの日が今日のDailyが存在すれば作成しない", () => {
    // 作成日が異なっても今日の日付タイトルがあれば重複作成しないことを保証する。
    expect(
      shouldCreateTodayPage(
        [
          {
            createdTime: "2024-01-01T00:00:00.000Z",
            title: "26.07.22（水）",
            periodType: null,
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
            title: "26.07.21（火）",
            periodType: null,
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
            title: "",
            periodType: null,
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
            title: "",
            periodType: null,
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
            title: "",
            periodType: null,
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
            title: "今日のメモ",
            periodType: null,
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
            title: "26.W30",
            periodType: "weekly" as const,
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
            title: "26.07.22（水）",
            periodType: "monthly" as const,
          },
        ],
        now,
      ),
    ).toBe(true);
  });
});
