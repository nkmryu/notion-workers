import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { dailyOn, habitOn } from "../domain/testing";
import { runMaintenance } from "./run-maintenance";
import { createFakeDiary, createFakeHabits, noPageTitles } from "./testing";

const date = Temporal.PlainDate.from;

describe("runMaintenance: Daily", () => {
  it("今日の Daily を作り、終わった日をロックし、月末の Daily にはまとめを書いてからロックする", async () => {
    // 1 回の実行で今日のページの作成と過去日のロックまで進み、締めの日だけはまとめが揃ってから閉じることを保証する。
    // 2026-08-01（土）: 07-31 は 26.M07 の締めの日。
    const diary = createFakeDiary({
      dailies: [dailyOn("2026-07-30", { id: "d-0730" }), dailyOn("2026-07-31", { id: "d-0731" })],
      markdown: { "d-0730": "木曜\n", "d-0731": "金曜\n" },
    });

    const summary = await runMaintenance(
      { diary, habits: createFakeHabits(), pageTitles: noPageTitles },
      date("2026-08-01"),
    );

    expect(diary.calls).toEqual([
      { method: "createDaily", title: "26.08.01（土）", date: date("2026-08-01") },
      { method: "lockPage", pageId: "d-0730" },
      { method: "appendMarkdown", pageId: "d-0731", content: "---\n# 26.M07\n" },
      { method: "appendMarkdown", pageId: "d-0731", content: "---\n## 26.07.30（木）\n木曜\n" },
      { method: "lockPage", pageId: "d-0731" },
    ]);
    expect(summary.daily).toEqual({ created: 1, renames: 0, locks: 1 });
    expect(summary.digest).toEqual({ targets: 1, daysTransferred: 1, fallbackDates: [], refs: 0, locks: 1 });
  });

  it("今日の Daily があり、過去日がロック済みなら何もしない", async () => {
    // 2:23 に処理した日の 7:23 の再実行で、作成もまとめもロックも重ねないことを保証する。
    const diary = createFakeDiary({
      dailies: [dailyOn("2026-07-31", { id: "d-0731", isLocked: true }), dailyOn("2026-08-01", { id: "d-0801" })],
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-08-01"));

    expect(diary.calls).toEqual([]);
  });
});

describe("runMaintenance: 週のまとめ", () => {
  it("週が変わった最初の実行で、月〜土を日曜の Daily の末尾へ転記してからロックする", async () => {
    // 日曜の本文の後ろに 26.W46 のまとめを置き、日曜自身は写し直さないことを保証する。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-11-09", { id: "d-1109", isLocked: true }),
        dailyOn("2026-11-10", { id: "d-1110", isLocked: true }),
        dailyOn("2026-11-15", { id: "d-1115" }),
        dailyOn("2026-11-16", { id: "d-1116" }),
      ],
      markdown: { "d-1109": "月曜\n", "d-1110": "火曜\n", "d-1115": "日曜の本文\n" },
    });

    const summary = await runMaintenance(
      { diary, habits: createFakeHabits(), pageTitles: noPageTitles },
      date("2026-11-16"),
    );

    expect(diary.calls.map((call) => call.method)).toEqual([
      "appendMarkdown", // まとめの見出し
      "appendMarkdown", // 11-09
      "appendMarkdown", // 11-10
      "lockPage", // d-1115
    ]);
    expect(diary.markdownOf("d-1115")).toBe(
      "日曜の本文\n---\n# 26.W46\n---\n## 26.11.09（月）\n月曜\n---\n## 26.11.10（火）\n火曜\n",
    );
    expect(summary.digest).toMatchObject({ targets: 1, daysTransferred: 2, refs: 0, locks: 1 });
  });

  it("日曜の Daily が無い週は、日曜の Daily を作ってからまとめを書く", async () => {
    // 日曜を書かなかった週にも、日曜の日付でまとめの置き場を用意することを保証する。
    const diary = createFakeDiary({
      dailies: [dailyOn("2026-11-13", { id: "d-1113", isLocked: true }), dailyOn("2026-11-17", { id: "d-1117" })],
      markdown: { "d-1113": "金曜\n" },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-11-17"));

    expect(diary.calls).toEqual([
      { method: "createDaily", title: "26.11.15（日）", date: date("2026-11-15") },
      { method: "appendMarkdown", pageId: "daily-2026-11-15", content: "---\n# 26.W46\n" },
      { method: "appendMarkdown", pageId: "daily-2026-11-15", content: "---\n## 26.11.13（金）\n金曜\n" },
      { method: "lockPage", pageId: "daily-2026-11-15" },
    ]);
  });

  it("日曜が月末と重なる日は、月のまとめだけを書く", async () => {
    // 同じ本文を 1 ページに 2 回並べないことを保証する。2026-05-31 は日曜で月末。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-05-30", { id: "d-0530", isLocked: true }),
        dailyOn("2026-05-31", { id: "d-0531" }),
        dailyOn("2026-06-01", { id: "d-0601" }),
      ],
      markdown: { "d-0530": "土曜\n" },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-06-01"));

    expect(diary.markdownOf("d-0531")).toBe("---\n# 26.M05\n---\n## 26.05.30（土）\n土曜\n");
  });
});

describe("runMaintenance: 月のまとめと Refs", () => {
  const novemberEnd = {
    dailies: [
      dailyOn("2026-11-28", { id: "d-1128", isLocked: true }),
      // 11-29 は 26.W48 の締めの日で、まとめを書き終えてロック済み。
      dailyOn("2026-11-29", { id: "d-1129", isLocked: true }),
      dailyOn("2026-11-30", { id: "d-1130" }),
      dailyOn("2026-12-01", { id: "d-1201" }),
    ],
    markdown: {
      "d-1128": "本文 [記事A](https://example.com/a)\n",
      "d-1129": "本文 [記事B](https://example.com/b)\n",
      "d-1130": "月末の本文 [記事C](https://example.com/c)\n",
    },
  };

  it("月が変わった最初の実行で、転記 → Refs → ロックの順に 1 回で進める", async () => {
    // Refs は月末の Daily 自身の本文も含めて初出順にまとめ、書き終えてから閉じることを保証する。
    const diary = createFakeDiary(novemberEnd);

    const summary = await runMaintenance(
      { diary, habits: createFakeHabits(), pageTitles: noPageTitles },
      date("2026-12-01"),
    );

    expect(diary.calls.map((call) => call.method)).toEqual([
      "appendMarkdown", // まとめの見出し
      "appendMarkdown", // 11-28
      "appendMarkdown", // 11-29
      "appendMarkdown", // Refs
      "lockPage", // d-1130
    ]);
    expect(diary.markdownOf("d-1130")).toContain(
      "---\n## Refs\n- [記事C](https://example.com/c)\n- [記事A](https://example.com/a)\n- [記事B](https://example.com/b)\n",
    );
    expect(summary.digest).toMatchObject({ targets: 1, daysTransferred: 2, refs: 1, locks: 1 });
  });

  it("Refs の追記が失敗したら、月末の Daily をロックせずに実行を止める", async () => {
    // 閉じる前の工程が終わらない限りロックせず、次の実行で Refs から続けられることを保証する。
    const diary = createFakeDiary({
      ...novemberEnd,
      rejectAppend(_pageId, content) {
        return content.includes("## Refs") ? new Error("Refs の追記に失敗") : null;
      },
    });

    await expect(
      runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01")),
    ).rejects.toThrow("Refs の追記に失敗");
    expect(diary.calls.filter((call) => call.method === "lockPage")).toEqual([]);
  });

  it("転記と Refs を書き終えた月末の Daily には、再実行で何も足さずにロックだけする", async () => {
    // まとめの見出しより後ろの日付見出しと Refs 見出しを冪等キーにして、二重に書かないことを保証する。
    const diary = createFakeDiary({
      ...novemberEnd,
      markdown: {
        ...novemberEnd.markdown,
        "d-1130": "月末の本文\n---\n# 26.M11\n---\n## 26.11.28（土）\n本文\n---\n## 26.11.29（日）\n本文\n---\n## Refs\n- [x](https://example.com/x)\n",
      },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01"));

    expect(diary.calls).toEqual([{ method: "lockPage", pageId: "d-1130" }]);
  });
});

describe("runMaintenance: まとめの入れ子", () => {
  it("週のまとめを書いた日曜の Daily を月のまとめへ写すとき、週のまとめは写さない", async () => {
    // 週 → 月の順に続けて書いても、月のまとめに週のまとめが入れ子で重ならないことを保証する。
    // 2026-11-08 は 26.W45 の締めの日、2026-11-30 は 26.M11 の締めの日。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-11-02", { id: "d-1102", isLocked: true }),
        dailyOn("2026-11-08", { id: "d-1108" }),
        dailyOn("2026-11-30", { id: "d-1130" }),
        dailyOn("2026-12-01", { id: "d-1201" }),
      ],
      markdown: { "d-1102": "月曜\n", "d-1108": "日曜\n", "d-1130": "月末\n" },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01"));

    expect(diary.markdownOf("d-1108")).toBe("日曜\n---\n# 26.W45\n---\n## 26.11.02（月）\n月曜\n");
    expect(diary.markdownOf("d-1130")).toBe(
      "月末\n---\n# 26.M11\n---\n## 26.11.02（月）\n月曜\n---\n## 26.11.08（日）\n日曜\n",
    );
  });

  it("月のまとめを書いた月末の Daily を週のまとめへ写すとき、月のまとめは写さない", async () => {
    // 月末が週の途中にある週で、日曜のまとめに月のまとめが重ならないことを保証する。
    // 2026-10-31 は土曜の月末、2026-11-01 は 26.W44 の締めの日。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-10-30", { id: "d-1030", isLocked: true }),
        dailyOn("2026-10-31", { id: "d-1031" }),
        dailyOn("2026-11-01", { id: "d-1101" }),
        dailyOn("2026-11-02", { id: "d-1102" }),
      ],
      markdown: { "d-1030": "金曜\n", "d-1031": "土曜\n", "d-1101": "日曜\n" },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-11-02"));

    expect(diary.markdownOf("d-1101")).toBe(
      "日曜\n---\n# 26.W44\n---\n## 26.10.30（金）\n金曜\n---\n## 26.10.31（土）\n土曜\n",
    );
  });
});

describe("runMaintenance: 習慣", () => {
  it("今日の習慣ページが無ければ、今日のタイトルで 1 件だけ作る", async () => {
    // 過去日の習慣ページしか無い日に、今日の分を作ることを保証する。
    const habits = createFakeHabits([habitOn("2026-07-31")]);

    const summary = await runMaintenance(
      { diary: createFakeDiary(), habits, pageTitles: noPageTitles },
      date("2026-08-01"),
    );

    expect(habits.createdTitles).toEqual(["26.08.01（土）"]);
    expect(summary.habit).toEqual({ created: 1 });
  });

  it("今日の習慣ページがあれば作らない", async () => {
    // 2:23 に作った日の 7:23 の再実行で、同じ日のページを二重に作らないことを保証する。
    const habits = createFakeHabits([habitOn("2026-07-31"), habitOn("2026-08-01")]);

    const summary = await runMaintenance(
      { diary: createFakeDiary(), habits, pageTitles: noPageTitles },
      date("2026-08-01"),
    );

    expect(habits.createdTitles).toEqual([]);
    expect(summary.habit).toEqual({ created: 0 });
  });

  it("まとめの処理が失敗する実行でも、今日の習慣ページは作られている", async () => {
    // 習慣の作成をまとめより前に行い、日誌の後段の失敗に巻き込まないことを保証する。
    const habits = createFakeHabits();
    const diary = createFakeDiary({
      dailies: [dailyOn("2026-07-30", { id: "d-0730", isLocked: true }), dailyOn("2026-07-31", { id: "d-0731" })],
      rejectAppend() {
        return new Error("まとめの追記に失敗");
      },
    });

    await expect(
      runMaintenance({ diary, habits, pageTitles: noPageTitles }, date("2026-08-01")),
    ).rejects.toThrow("まとめの追記に失敗");
    expect(habits.createdTitles).toEqual(["26.08.01（土）"]);
  });
});
