import { describe, expect, it } from "vitest";

import { PAGE_ACTION_TYPE } from "./page";

describe("操作の種類の値", () => {
  it("PAGE_ACTION_TYPE の値は snake_case の文字列で、キーと一致する", () => {
    // ログでの突き合わせで読めるよう、値が snake_case の機械トークンであることを保証する。
    for (const [key, value] of Object.entries(PAGE_ACTION_TYPE)) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(value).toBe(key);
    }
  });
});
