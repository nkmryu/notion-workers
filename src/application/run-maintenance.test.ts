import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { dailyOn, habitOn } from "../domain/testing";
import { runMaintenance } from "./run-maintenance";
import { createFakeDiary, createFakeHabits } from "./testing";

// 2026-08-01（土）: 月と ISO 週の区切りをまたいでも、Daily と習慣の処理だけが走ることを確かめる日。
const firstOfAugust = Temporal.PlainDate.from("2026-08-01");

describe("runMaintenance: Daily", () => {
  it("今日の Daily が無ければ作り、終了した Daily をロックする", async () => {
    // 1 回の実行で、今日のページの作成と、書き終えた過去日のロックまで進むことを保証する。
    const diary = createFakeDiary([
      dailyOn("2026-07-30", { id: "d-0730" }),
      dailyOn("2026-07-31", { id: "d-0731" }),
    ]);

    const summary = await runMaintenance({ diary, habits: createFakeHabits() }, firstOfAugust);

    expect(diary.calls).toEqual([
      { method: "createDaily", title: "26.08.01（土）" },
      { method: "lockPage", pageId: "d-0730" },
      { method: "lockPage", pageId: "d-0731" },
    ]);
    expect(summary.daily).toEqual({ created: 1, renames: 0, locks: 2 });
  });

  it("今日の Daily があり、過去日がロック済みなら何もしない", async () => {
    // 2:23 に処理した日の 7:23 の再実行で、作成もロックも重ねないことを保証する。
    const diary = createFakeDiary([
      dailyOn("2026-07-31", { id: "d-0731", isLocked: true }),
      dailyOn("2026-08-01", { id: "d-0801" }),
    ]);

    const summary = await runMaintenance({ diary, habits: createFakeHabits() }, firstOfAugust);

    expect(diary.calls).toEqual([]);
    expect(summary.daily).toEqual({ created: 0, renames: 0, locks: 0 });
  });
});

describe("runMaintenance: 習慣", () => {
  it("今日の習慣ページが無ければ、今日のタイトルで 1 件だけ作る", async () => {
    // 過去日の習慣ページしか無い日に、今日の分を作ることを保証する。
    const habits = createFakeHabits([habitOn("2026-07-31")]);

    const summary = await runMaintenance({ diary: createFakeDiary(), habits }, firstOfAugust);

    expect(habits.createdTitles).toEqual(["26.08.01（土）"]);
    expect(summary.habit).toEqual({ created: 1 });
  });

  it("今日の習慣ページがあれば作らない", async () => {
    // 2:23 に作った日の 7:23 の再実行で、同じ日のページを二重に作らないことを保証する。
    const habits = createFakeHabits([habitOn("2026-07-31"), habitOn("2026-08-01")]);

    const summary = await runMaintenance({ diary: createFakeDiary(), habits }, firstOfAugust);

    expect(habits.createdTitles).toEqual([]);
    expect(summary.habit).toEqual({ created: 0 });
  });
});
