import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { decideDailyPageAction, shouldCreateTodayPage } from "./daily";

const today = Temporal.PlainDate.from("2026-07-22");

describe("Daily のアクション決定", () => {
  it("今日の Daily 候補（空タイトル）に今日の日次タイトルを付ける", () => {
    // テンプレート適用前の空ページへ今日の日次タイトルを付けることを保証する。
    expect(
      decideDailyPageAction({ date: Temporal.PlainDate.from("2026-07-22"), title: "", isLocked: false }, today),
    ).toEqual({ type: "rename", title: "26.07.22（水）" });
  });

  it("今日の日付で曜日だけ異なる Daily を期待タイトルへ直す", () => {
    // 曜日を日付同定には使わず、今日の日次タイトルの整形では正しい曜日へ直すことを保証する。
    expect(
      decideDailyPageAction(
        { date: Temporal.PlainDate.from("2026-07-22"), title: "26.07.22（火）", isLocked: false },
        today,
      ),
    ).toEqual({ type: "rename", title: "26.07.22（水）" });
  });

  it("今日の日付でリネーム済みの Daily には何もしない", () => {
    // 今日のページへ不要な PATCH を重ねないことを保証する。
    expect(
      decideDailyPageAction(
        { date: Temporal.PlainDate.from("2026-07-22"), title: "26.07.22（水）", isLocked: false },
        today,
      ),
    ).toEqual({ type: "none" });
  });

  it("過去日の未ロック Daily をロックする", () => {
    // 終了した日のページを編集不可にすることを保証する。
    expect(
      decideDailyPageAction(
        { date: Temporal.PlainDate.from("2026-07-21"), title: "26.07.21（火）", isLocked: false },
        today,
      ),
    ).toEqual({ type: "lock" });
  });

  it("過去日のロック済み Daily には何もしない", () => {
    // ロック済みページへ PATCH を重ねないことを保証する。
    expect(
      decideDailyPageAction(
        { date: Temporal.PlainDate.from("2026-07-21"), title: "26.07.21（火）", isLocked: true },
        today,
      ),
    ).toEqual({ type: "none" });
  });

  it("未来の日付の Daily には何もしない", () => {
    // 先に作られた未来日のページをロックもリネームもしないことを保証する。
    expect(
      decideDailyPageAction(
        { date: Temporal.PlainDate.from("2026-07-23"), title: "26.07.23（木）", isLocked: false },
        today,
      ),
    ).toEqual({ type: "none" });
  });
});

describe("今日の Daily の作成判定", () => {
  it("今日の Daily が存在すれば作成しない", () => {
    // 同じ日のページを二重に作らないことを保証する。
    expect(shouldCreateTodayPage([{ date: Temporal.PlainDate.from("2026-07-22") }], today)).toBe(false);
  });

  it("過去日の Daily だけなら今日のページを作成する", () => {
    // 前日までのページがあっても今日の分は別に作ることを保証する。
    expect(shouldCreateTodayPage([{ date: Temporal.PlainDate.from("2026-07-21") }], today)).toBe(true);
  });

  it("Daily が 0 件なら今日のページを作成する", () => {
    // 空のデータベースからでも運用を始められることを保証する。
    expect(shouldCreateTodayPage([], today)).toBe(true);
  });
});
