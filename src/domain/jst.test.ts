import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { toJstDate } from "./jst";

describe("toJstDate", () => {
  it("UTC 15:00 の直前は JST の当日として扱う", () => {
    // JST の日付境界直前に翌日へ進まないことを保証する。
    expect(toJstDate(Temporal.Instant.from("2026-07-21T14:59:59.999Z")).toString()).toBe(
      "2026-07-21",
    );
  });

  it("UTC 15:00 から JST の翌日として扱う", () => {
    // JST の日付境界で日付が切り替わることを保証する。
    expect(toJstDate(Temporal.Instant.from("2026-07-21T15:00:00.000Z")).toString()).toBe(
      "2026-07-22",
    );
  });
});
