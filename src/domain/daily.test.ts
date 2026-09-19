import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { DailyPage, formatDailyTitle, parseDailyTitle, shouldCreateTodayPage } from "./daily";
import { dailyOn as daily } from "./testing";

const today = Temporal.PlainDate.from("2026-07-22");

describe("Daily のアクション決定", () => {
  it("今日の Daily 候補（空タイトル）に今日の日次タイトルを付ける", () => {
    // テンプレート適用前の空ページへ今日の日次タイトルを付けることを保証する。
    expect(
      daily("2026-07-22", { title: "", createdTime: "2026-07-21T15:00:00.000Z" }).decideActions(today),
    ).toEqual([{ type: "rename", title: "26.07.22（水）" }]);
  });

  it("今日の日付で曜日だけ異なる Daily を期待タイトルへ直す", () => {
    // 曜日を日付同定には使わず、今日の日次タイトルの整形では正しい曜日へ直すことを保証する。
    expect(
      daily("2026-07-22", { title: "26.07.22（火）", isLocked: false }).decideActions(today),
    ).toEqual([{ type: "rename", title: "26.07.22（水）" }]);
  });

  it("今日の日付でリネーム済みの Daily には何もしない", () => {
    // 今日のページへ不要な PATCH を重ねないことを保証する。
    expect(
      daily("2026-07-22", { title: "26.07.22（水）", isLocked: false }).decideActions(today),
    ).toEqual([]);
  });

  it("過去日の未ロック Daily をロックする", () => {
    // 終了した日のページを編集不可にすることを保証する。
    expect(
      daily("2026-07-21", { title: "26.07.21（火）", isLocked: false }).decideActions(today),
    ).toEqual([{ type: "lock" }]);
  });

  it("過去日のロック済み Daily には何もしない", () => {
    // ロック済みページへ PATCH を重ねないことを保証する。
    expect(
      daily("2026-07-21", { title: "26.07.21（火）", isLocked: true }).decideActions(today),
    ).toEqual([]);
  });

  it("未来の日付の Daily には何もしない", () => {
    // 先に作られた未来日のページをロックもリネームもしないことを保証する。
    expect(
      daily("2026-07-23", { title: "26.07.23（木）", isLocked: false }).decideActions(today),
    ).toEqual([]);
  });
});

describe("DailyPage.fromRecord", () => {
  it("タイトルの日付を採用し、作成日は使わない", () => {
    // インポートで作成日が偏っていてもタイトルが示す日を業務日とすることを保証する。
    const page = DailyPage.fromRecord({
      id: "daily",
      createdTime: "2026-07-20T03:00:00.000Z",
      title: "24.12.30（月）",
      isLocked: true,
    });

    expect(page.date).toEqual(Temporal.PlainDate.from("2024-12-30"));
    expect(page.createdAt).toEqual(Temporal.Instant.from("2026-07-20T03:00:00.000Z"));
    expect(page.isLocked).toBe(true);
  });

  it("空タイトルなら作成日（JST）を日付にする", () => {
    // テンプレート適用前の空タイトルでも今日の Daily として扱えることを保証する。
    expect(
      DailyPage.fromRecord({
        id: "daily",
        createdTime: "2026-07-21T15:00:00.000Z",
        title: "",
        isLocked: false,
      }).date,
    ).toEqual(Temporal.PlainDate.from("2026-07-22"));
  });

  it("日付でも空でもないタイトルは生成できない", () => {
    // Daily 種別のページにメモのタイトルが付いた不整合を黙って処理しないことを保証する。
    expect(function () {
      DailyPage.fromRecord({ id: "daily", createdTime: "2026-07-20T03:00:00.000Z", title: "メモ", isLocked: false });
    }).toThrow("Daily のタイトルが日付形式ではありません: メモ");
  });
});

describe("今日の Daily の作成判定", () => {
  it("今日の Daily が存在すれば作成しない", () => {
    // 同じ日のページを二重に作らないことを保証する。
    expect(shouldCreateTodayPage([daily("2026-07-22")], today)).toBe(false);
  });

  it("過去日の Daily だけなら今日のページを作成する", () => {
    // 前日までのページがあっても今日の分は別に作ることを保証する。
    expect(shouldCreateTodayPage([daily("2026-07-21")], today)).toBe(true);
  });

  it("Daily が 0 件なら今日のページを作成する", () => {
    // 空のデータベースからでも運用を始められることを保証する。
    expect(shouldCreateTodayPage([], today)).toBe(true);
  });
});

describe("formatDailyTitle", () => {
  it("2 桁年・ゼロ埋めの月日・日本語曜日でタイトルを整形する", () => {
    // 暦日から日誌タイトルを生成できることを保証する。
    expect(formatDailyTitle(Temporal.PlainDate.from("2026-07-22"))).toBe("26.07.22（水）");
  });

  it("日曜を「日」にする", () => {
    // Temporal の dayOfWeek（月曜 = 1 … 日曜 = 7）を日本語曜日へ正しく写すことを保証する。
    expect(formatDailyTitle(Temporal.PlainDate.from("2026-07-26"))).toBe("26.07.26（日）");
  });
});

describe("parseDailyTitle", () => {
  it("曜日文字が実際と異なっても年月日だけで日付を決める", () => {
    // 曜日文字を日付同定の条件に含めないことを保証する。
    expect(parseDailyTitle("26.07.22（火）")).toEqual(Temporal.PlainDate.from("2026-07-22"));
  });

  it("日付形式でないタイトルは null", () => {
    // メモのタイトルを日付として誤読しないことを保証する。
    expect(parseDailyTitle("週のメモ")).toBeNull();
  });

  it("存在しない日付は失敗する", () => {
    // 2 月 30 日のようなタイトルを別の日へ丸めないことを保証する。
    expect(function () {
      parseDailyTitle("26.02.30（月）");
    }).toThrow("日付が不正です: 26.02.30（月）");
  });
});
