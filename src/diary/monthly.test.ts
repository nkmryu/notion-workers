import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { monthly, formatCalendarMonthTitle, parseCalendarMonthTitle } from "./monthly";
import { resolvePeriodKey } from "./period";

describe("月次タイトル", () => {
  it("暦年とゼロ埋めした月を整形する", () => {
    // 月次タイトルが26.M01形式になることを保証する。
    expect(formatCalendarMonthTitle(Temporal.PlainYearMonth.from({ year: 2026, month: 1 }))).toBe("26.M01");
  });

  it("タイトルを作成月より優先して解析する", () => {
    // インポート後もタイトルが示す暦月へMonthlyを帰属させることを保証する。
    expect(
      resolvePeriodKey(monthly, {
        createdTime: "2026-07-01T00:00:00.000Z",
        title: "25.M12",
      }),
    ).toEqual(Temporal.PlainYearMonth.from({ year: 2025, month: 12 }));
  });

  it("不正な月を解析しない", () => {
    // 月範囲外のタイトルを月識別に使わないことを保証する。
    expect(parseCalendarMonthTitle("26.M13", 2026)).toBeNull();
  });
});
