import { describe, expect, it } from "vitest";

import { decidePageAction } from "./page-action";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("decidePageAction", () => {
  it("今日作成された空タイトルのDaily候補をリネームする", () => {
    // テンプレート適用前の空ページへ今日の日次タイトルを付けることを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2026-07-21T15:00:00.000Z",
          isLocked: false,
          currentTitle: "",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "rename", title: "26.07.22（水）" });
  });

  it("今日の日付で曜日だけ異なるDailyを期待タイトルへ直す", () => {
    // 曜日を日付同定には使わず、今日の日次タイトルの整形では正しい曜日へ直すことを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2024-01-01T00:00:00.000Z",
          isLocked: false,
          currentTitle: "26.07.22（火）",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "rename", title: "26.07.22（水）" });
  });

  it("今日の日付でリネーム済みのDailyには何もしない", () => {
    // 同じ入力で再実行しても不要なタイトル更新を行わないことを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2024-01-01T00:00:00.000Z",
          isLocked: false,
          currentTitle: "26.07.22（水）",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("今日作成でも非日付タイトルのメモはリネームしない", () => {
    // ユーザーが付けたメモタイトルを今日の日次タイトルで上書きしないことを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2026-07-22T10:00:00.000Z",
          isLocked: false,
          currentTitle: "今日のメモ",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("タイトルの日が過去の未ロックDailyをロックする", () => {
    // 作成日が今日でもタイトルの日が過去なら終了済み日次として扱うことを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2026-07-22T01:00:00.000Z",
          isLocked: false,
          currentTitle: "24.12.30（月）",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "lock" });
  });

  it("過去作成の未ロックメモをロックしない", () => {
    // 日付タイトルでないページを日次ロック対象へ含めないことを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2024-12-30T03:00:00.000Z",
          isLocked: false,
          currentTitle: "振り返りメモ",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("過去日のロック済みDailyには何もしない", () => {
    // ロック済みページへ重複PATCHしないことを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2026-07-22T01:00:00.000Z",
          isLocked: true,
          currentTitle: "26.07.20（月）",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("未来の日付タイトルには何もしない", () => {
    // タイトルの日が未来のDailyを誤って変更しないことを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.07.23（木）",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("週次ページを日次アクションの対象にしない", () => {
    // 日付形式のタイトルでもtypeがWeeklyなら日次処理から除外することを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.07.20（月）",
          isWeekly: true,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("月次ページを日次アクションの対象にしない", () => {
    // 日付形式のタイトルでもtypeがMonthlyなら日次リネームとロックから除外することを保証する。
    expect(
      decidePageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.07.20（月）",
          isWeekly: false,
          isMonthly: true,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });
});
