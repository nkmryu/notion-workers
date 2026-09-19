import { describe, expect, it } from "vitest";

import { PAGE_ACTION_TYPE, PERIOD_TYPE } from "./page";

describe("状態・種別の値", () => {
  it.each([
    ["PERIOD_TYPE", PERIOD_TYPE],
    ["PAGE_ACTION_TYPE", PAGE_ACTION_TYPE],
  ])("%s の値は snake_case の文字列で、キーと一致する", (_name, values) => {
    // ログや Notion の select 名との突き合わせで読めるよう、値が snake_case の機械トークンであることを保証する。
    for (const [key, value] of Object.entries(values)) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(value).toBe(key);
    }
  });
});
