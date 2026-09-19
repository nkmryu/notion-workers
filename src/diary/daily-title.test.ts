import { describe, expect, it } from "vitest";

import { formatDailyTitle } from "./daily-title";

describe("formatDailyTitle", () => {
  it("JST の日付と日本語曜日でタイトルを整形する", () => {
    // UTC の日時から JST の日誌タイトルを生成できることを保証する。
    expect(formatDailyTitle(new Date("2026-07-22T03:00:00.000Z"))).toBe(
      "26.07.22（水）",
    );
  });

  it("UTC 15:00 の直前は JST の当日として扱う", () => {
    // JST の日付境界直前に翌日へ進まないことを保証する。
    expect(formatDailyTitle(new Date("2026-07-21T14:59:59.999Z"))).toBe(
      "26.07.21（火）",
    );
  });

  it("UTC 15:00 から JST の翌日として扱う", () => {
    // JST の日付境界で日付と曜日が切り替わることを保証する。
    expect(formatDailyTitle(new Date("2026-07-21T15:00:00.000Z"))).toBe(
      "26.07.22（水）",
    );
  });
});
