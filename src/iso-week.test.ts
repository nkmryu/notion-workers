import { describe, expect, it } from "vitest";

import { formatWeeklyTitle, getJstIsoWeek } from "./iso-week";

describe("getJstIsoWeek", () => {
  it.each([
    ["2026-01-01T03:00:00.000Z", { year: 2026, week: 1 }],
    ["2027-01-01T03:00:00.000Z", { year: 2026, week: 53 }],
    ["2024-12-30T03:00:00.000Z", { year: 2025, week: 1 }],
  ])("%s を既知の ISO 週へ変換する", (date, expected) => {
    // 年末年始に暦年ではなく ISO 週基準年を返すことを保証する。
    expect(getJstIsoWeek(new Date(date))).toEqual(expected);
  });

  it("UTC 15:00 を境に JST の所属週が変わる", () => {
    // JST の月曜0時を境に翌 ISO 週へ切り替わることを保証する。
    expect(getJstIsoWeek(new Date("2024-12-29T14:59:59.999Z"))).toEqual({
      year: 2024,
      week: 52,
    });
    expect(getJstIsoWeek(new Date("2024-12-29T15:00:00.000Z"))).toEqual({
      year: 2025,
      week: 1,
    });
  });
});

describe("formatWeeklyTitle", () => {
  it("ISO 週番号を2桁でゼロ埋めする", () => {
    // 週次タイトルを YY.Www 形式で生成することを保証する。
    expect(formatWeeklyTitle(new Date("2026-01-29T03:00:00.000Z"))).toBe(
      "26.W05",
    );
  });

  it("ISO 週基準年をタイトルの年に使う", () => {
    // 暦年と ISO 週基準年が異なる日も正しいタイトルになることを保証する。
    expect(formatWeeklyTitle(new Date("2027-01-01T03:00:00.000Z"))).toBe(
      "26.W53",
    );
  });
});
