import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { formatIsoWeekTitle, isoWeekOf } from "./weekly";

describe("isoWeekOf", () => {
  it.each([
    ["2026-01-01", { year: 2026, week: 1 }],
    ["2027-01-01", { year: 2026, week: 53 }],
    ["2024-12-30", { year: 2025, week: 1 }],
  ])("%s を既知の ISO 週へ変換する", (date, expected) => {
    // 年末年始に暦年ではなく ISO 週基準年を返すことを保証する。
    expect(isoWeekOf(Temporal.PlainDate.from(date))).toEqual(expected);
  });

  it("日曜と翌月曜で ISO 週が切り替わる", () => {
    // 週の境界が月曜であることを保証する。
    expect(isoWeekOf(Temporal.PlainDate.from("2024-12-29"))).toEqual({ year: 2024, week: 52 });
    expect(isoWeekOf(Temporal.PlainDate.from("2024-12-30"))).toEqual({ year: 2025, week: 1 });
  });
});

describe("formatIsoWeekTitle", () => {
  it("ISO 週番号を2桁でゼロ埋めする", () => {
    // 週次タイトルを YY.Www 形式で生成することを保証する。
    expect(formatIsoWeekTitle(isoWeekOf(Temporal.PlainDate.from("2026-01-29")))).toBe(
      "26.W05",
    );
  });

  it("ISO 週基準年をタイトルの年に使う", () => {
    // 暦年と ISO 週基準年が異なる日も正しいタイトルになることを保証する。
    expect(formatIsoWeekTitle(isoWeekOf(Temporal.PlainDate.from("2027-01-01")))).toBe(
      "26.W53",
    );
  });
});
