import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { formatDailyTitle, parseDailyTitle } from "./daily-title";

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
