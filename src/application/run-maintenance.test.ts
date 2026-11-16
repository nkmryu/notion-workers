import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { ContentRejectedError } from "../domain/diary-repository";
import { dailyOn, habitOn } from "../domain/testing";
import { runMaintenance } from "./run-maintenance";
import { createFakeDiary, createFakeHabits, noPageTitles } from "./testing";

const date = Temporal.PlainDate.from;

describe("runMaintenance: Daily", () => {
  it("今日の Daily を作り、終わった日をロックし、月末の Daily にはまとめを書いてからロックする", async () => {
    // 1 回の実行で今日のページの作成と過去日のロックまで進み、締めの日だけはまとめが揃ってから閉じることを保証する。
    // 月のまとめに写した 07-30 は、月末をロックする前にゴミ箱へ移す。
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
      { method: "appendMarkdown", pageId: "d-0731", content: "# 26.M07\n" },
      { method: "appendMarkdown", pageId: "d-0731", content: "## 26.07.30（木）\n---\n木曜\n<empty-block/>\n" },
      { method: "trashPage", pageId: "d-0730" },
      { method: "lockPage", pageId: "d-0731" },
    ]);
    expect(summary.daily).toEqual({ created: 1, renames: 0, locks: 1 });
    expect(summary.digest).toEqual({
      targets: 1,
      daysTransferred: 1,
      fallbackDates: [],
      refs: 0,
      weeklyDigestsRemoved: 0,
      sundaysTrashed: 0,
      dailiesTrashed: 1,
      locks: 1,
    });
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
  it("週が変わった最初の実行で、月〜土を日曜の Daily の末尾へ転記し、月〜土の Daily を移してからロックする", async () => {
    // 日曜の本文の後ろに 26.W46 のまとめを置き、日曜自身は写し直さず、今月の終わった週を日曜の Daily だけにすることを保証する。
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
      "trashPage", // d-1109
      "trashPage", // d-1110
      "lockPage", // d-1115
    ]);
    expect(diary.markdownOf("d-1115")).toBe(
      "日曜の本文\n# 26.W46\n## 26.11.09（月）\n---\n月曜\n<empty-block/>\n## 26.11.10（火）\n---\n火曜\n<empty-block/>\n",
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
      { method: "appendMarkdown", pageId: "daily-2026-11-15", content: "# 26.W46\n" },
      { method: "appendMarkdown", pageId: "daily-2026-11-15", content: "## 26.11.13（金）\n---\n金曜\n<empty-block/>\n" },
      { method: "trashPage", pageId: "d-1113" },
      { method: "lockPage", pageId: "daily-2026-11-15" },
    ]);
  });

  it("月が変わってから、前の月の週のまとめは書かない", async () => {
    // 11-30 の実行が無かった週は、12-01 の実行で 26.W48 を書かず、11 月のまとめだけに入れることを保証する。
    // 2026-11-29 は 26.W48 の日曜、2026-11-30 は月曜の月末。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-11-28", { id: "d-1128", isLocked: true }),
        dailyOn("2026-11-29", { id: "d-1129" }),
        dailyOn("2026-11-30", { id: "d-1130" }),
      ],
      markdown: { "d-1128": "土曜\n", "d-1129": "日曜\n", "d-1130": "月末\n" },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01"));

    expect(diary.markdownOf("d-1129")).toBe("日曜\n");
    expect(diary.markdownOf("d-1130")).toBe(
      "月末\n# 26.M11\n## 26.11.28（土）\n---\n土曜\n<empty-block/>\n## 26.11.29（日）\n---\n日曜\n<empty-block/>\n",
    );
  });

  it("月をまたぐ週は、前の月の日を週のまとめへ写さない", async () => {
    // 10 月の日は 10 月のまとめだけに入り、11-01 の 26.W44 には写さないことを保証する。
    // 2026-10-31 は土曜の月末、2026-11-01 は 26.W44 の日曜。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-10-30", { id: "d-1030", isLocked: true }),
        dailyOn("2026-10-31", { id: "d-1031", isLocked: true }),
        dailyOn("2026-11-01", { id: "d-1101" }),
        dailyOn("2026-11-02", { id: "d-1102" }),
      ],
      markdown: { "d-1030": "金曜\n", "d-1031": "土曜\n# 26.M10\n", "d-1101": "日曜\n" },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-11-02"));

    expect(diary.calls).toEqual([{ method: "lockPage", pageId: "d-1101" }]);
    expect(diary.markdownOf("d-1101")).toBe("日曜\n");
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

    expect(diary.markdownOf("d-0531")).toBe("# 26.M05\n## 26.05.30（土）\n---\n土曜\n<empty-block/>\n");
  });
});

describe("runMaintenance: 月のまとめと Refs", () => {
  // 11-29 は 26.W48 の締めの日で、週のまとめを書き終えてロック済み。
  const novemberEnd = {
    dailies: [
      dailyOn("2026-11-28", { id: "d-1128", isLocked: true }),
      dailyOn("2026-11-29", { id: "d-1129", isLocked: true }),
      dailyOn("2026-11-30", { id: "d-1130" }),
      dailyOn("2026-12-01", { id: "d-1201" }),
    ],
    markdown: {
      "d-1128": "本文 [記事A](https://example.com/a)\n",
      "d-1129": "本文 [記事B](https://example.com/b)\n# 26.W48\n## 26.11.28（土）\n---\n本文 [記事A](https://example.com/a)\n<empty-block/>\n",
      "d-1130": "月末の本文 [記事C](https://example.com/c)\n",
    },
  };

  it("月が変わった最初の実行で、転記 → Refs → 週のまとめの消去 → 普通の日の移動 → ロックの順に 1 回で進める", async () => {
    // Refs は月末の Daily 自身の本文も含めて初出順にまとめ、週のまとめと普通の日は月のまとめを書き終えてから片付け、最後に閉じることを保証する。
    const diary = createFakeDiary(novemberEnd);

    const summary = await runMaintenance(
      { diary, habits: createFakeHabits(), pageTitles: noPageTitles },
      date("2026-12-01"),
    );

    expect(diary.calls.map((call) => call.method)).toEqual([
      "appendMarkdown", // まとめの見出し
      "appendMarkdown", // 11-28
      "appendMarkdown", // 11-29（週のまとめは写さない）
      "appendMarkdown", // Refs
      "deleteMarkdown", // d-1129 の 26.W48
      "trashPage", // d-1128（土曜）
      "lockPage", // d-1130
    ]);
    expect(diary.markdownOf("d-1130")).toContain(
      "<empty-block/>\n## Refs\n- [記事C](https://example.com/c)\n- [記事A](https://example.com/a)\n- [記事B](https://example.com/b)\n",
    );
    expect(diary.markdownOf("d-1129")).toBe("本文 [記事B](https://example.com/b)\n");
    expect(summary.digest).toMatchObject({
      targets: 1,
      daysTransferred: 2,
      refs: 1,
      weeklyDigestsRemoved: 1,
      sundaysTrashed: 0,
      dailiesTrashed: 1,
      locks: 1,
    });
  });

  it("週のまとめを除くと本文が空の日曜は、Daily ごとゴミ箱へ移す", async () => {
    // まとめを置くためだけの日曜や、本文を書かなかった日曜を、空のページとして残さないことを保証する。
    const diary = createFakeDiary({
      ...novemberEnd,
      markdown: {
        ...novemberEnd.markdown,
        "d-1129": "<empty-block/>\n# 26.W48\n## 26.11.28（土）\n---\n本文\n<empty-block/>\n",
      },
    });

    const summary = await runMaintenance(
      { diary, habits: createFakeHabits(), pageTitles: noPageTitles },
      date("2026-12-01"),
    );

    expect(diary.calls.filter((call) => call.method === "trashPage" || call.method === "deleteMarkdown")).toEqual([
      { method: "trashPage", pageId: "d-1129" },
      { method: "trashPage", pageId: "d-1128" },
    ]);
    expect(summary.digest).toMatchObject({ weeklyDigestsRemoved: 0, sundaysTrashed: 1, dailiesTrashed: 1, locks: 1 });
  });

  it("本文を写せなかった日の Daily は残し、画像・ファイルの案内だけの日は移す", async () => {
    // 元の Daily にしか本文が無い日を消さず、本文が月のまとめにある日だけを片付けることを保証する。
    // 11-24 はコピーできないブロックを含み、11-25 は本文を受け付けられず注記になり、11-26 は画像だけを元ページに残す。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-11-24", { id: "d-1124", isLocked: true }),
        dailyOn("2026-11-25", { id: "d-1125", isLocked: true }),
        dailyOn("2026-11-26", { id: "d-1126", isLocked: true }),
        dailyOn("2026-11-27", { id: "d-1127", isLocked: true }),
        dailyOn("2026-11-30", { id: "d-1130" }),
      ],
      markdown: {
        "d-1124": "本文\n（コピー非対応ブロック。元ページを参照） @d-1124\n",
        "d-1125": "受け付けられない本文\n",
        "d-1126": "本文\n（画像/ファイルは元ページを参照） @d-1126\n",
        "d-1127": "本文\n",
        "d-1130": "月末\n",
      },
      rejectAppend(_pageId, content) {
        return content.includes("受け付けられない本文") ? new ContentRejectedError("d-1130", null) : null;
      },
    });

    const summary = await runMaintenance(
      { diary, habits: createFakeHabits(), pageTitles: noPageTitles },
      date("2026-12-01"),
    );

    expect(diary.calls.filter((call) => call.method === "trashPage")).toEqual([
      { method: "trashPage", pageId: "d-1126" },
      { method: "trashPage", pageId: "d-1127" },
    ]);
    expect(summary.digest).toMatchObject({ fallbackDates: [date("2026-11-25")], dailiesTrashed: 2, locks: 1 });
  });

  it("週のまとめの消去が失敗したら、月末の Daily をロックせずに実行を止める", async () => {
    // 月末のロックを「週のまとめを消し終えた」印として使えるよう、消し残しがあるまま閉じないことを保証する。
    const diary = createFakeDiary({
      ...novemberEnd,
      rejectDelete() {
        return new Error("週のまとめの消去に失敗");
      },
    });

    await expect(
      runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01")),
    ).rejects.toThrow("週のまとめの消去に失敗");
    expect(diary.calls.filter((call) => call.method === "lockPage")).toEqual([]);
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

  it("転記・Refs・週のまとめの消去・普通の日の移動を終えた月末の Daily には、再実行で何もせずにロックだけする", async () => {
    // まとめの見出しより後ろの日付見出しと Refs 見出し、日曜の週のまとめの見出しを冪等キーにして、二重に書かず消さないことを保証する。
    // 移した普通の日（11-28）は一覧に出ない。
    const diary = createFakeDiary({
      ...novemberEnd,
      dailies: novemberEnd.dailies.filter((daily) => daily.id !== "d-1128"),
      markdown: {
        ...novemberEnd.markdown,
        "d-1129": "本文 [記事B](https://example.com/b)\n",
        "d-1130": "月末の本文\n# 26.M11\n## 26.11.28（土）\n---\n本文\n<empty-block/>\n## 26.11.29（日）\n---\n本文\n<empty-block/>\n## Refs\n- [x](https://example.com/x)\n",
      },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01"));

    expect(diary.calls).toEqual([{ method: "lockPage", pageId: "d-1130" }]);
  });
});

describe("runMaintenance: 週のまとめから月のまとめへ", () => {
  // 11-02・11-03 の Daily は、26.W45 を書いた週末にゴミ箱へ移してあり、本文は 11-08 の週のまとめにだけある。
  const weekDigest = "# 26.W45\n## 26.11.02（月）\n---\n月曜\n<empty-block/>\n## 26.11.03（火）\n---\n火曜\n<empty-block/>\n";
  const carriedMonth = {
    dailies: [dailyOn("2026-11-08", { id: "d-1108", isLocked: true }), dailyOn("2026-11-30", { id: "d-1130" })],
    markdown: { "d-1108": `日曜\n${weekDigest}`, "d-1130": "月末\n" },
  };

  it("元の Daily を移した日は、週のまとめの節から月のまとめへ写してから、週のまとめを消す", async () => {
    // 週末に移した日の本文を月のまとめへ移し替え、写し終えてから週のまとめを消すことを保証する。
    const diary = createFakeDiary(carriedMonth);

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01"));

    expect(diary.markdownOf("d-1130")).toBe(
      "月末\n# 26.M11\n## 26.11.02（月）\n---\n月曜\n<empty-block/>\n## 26.11.03（火）\n---\n火曜\n<empty-block/>\n## 26.11.08（日）\n---\n日曜\n<empty-block/>\n",
    );
    expect(diary.markdownOf("d-1108")).toBe("日曜\n");
    expect(diary.calls.at(-1)).toEqual({ method: "lockPage", pageId: "d-1130" });
  });

  it("週のまとめの節を月のまとめが受け付けなければ、注記にせず止め、週のまとめを消さない", async () => {
    // 週のまとめにしか無い本文を、注記だけ残して消してしまわないことを保証する。
    const diary = createFakeDiary({
      ...carriedMonth,
      rejectAppend(_pageId, content) {
        return content.includes("火曜") ? new ContentRejectedError("d-1130", null) : null;
      },
    });

    await expect(
      runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01")),
    ).rejects.toThrow(ContentRejectedError);
    expect(diary.markdownOf("d-1108")).toBe(`日曜\n${weekDigest}`);
    expect(diary.calls.filter((call) => call.method === "lockPage" || call.method === "deleteMarkdown")).toEqual([]);
  });
});

describe("runMaintenance: まとめの入れ子", () => {
  it("週のまとめを書いた日曜の Daily を月のまとめへ写すとき、週のまとめは写さない", async () => {
    // 月のまとめに週のまとめが入れ子で重ならず、写し終えた後で日曜から週のまとめを消すことを保証する。
    // 2026-11-08 は 26.W45 の締めの日、2026-11-30 は 26.M11 の締めの日。
    const diary = createFakeDiary({
      dailies: [
        dailyOn("2026-11-02", { id: "d-1102", isLocked: true }),
        dailyOn("2026-11-08", { id: "d-1108", isLocked: true }),
        dailyOn("2026-11-30", { id: "d-1130" }),
        dailyOn("2026-12-01", { id: "d-1201" }),
      ],
      markdown: {
        "d-1102": "月曜\n",
        "d-1108": "日曜\n# 26.W45\n## 26.11.02（月）\n---\n月曜\n<empty-block/>\n",
        "d-1130": "月末\n",
      },
    });

    await runMaintenance({ diary, habits: createFakeHabits(), pageTitles: noPageTitles }, date("2026-12-01"));

    expect(diary.markdownOf("d-1130")).toBe(
      "月末\n# 26.M11\n## 26.11.02（月）\n---\n月曜\n<empty-block/>\n## 26.11.08（日）\n---\n日曜\n<empty-block/>\n",
    );
    expect(diary.markdownOf("d-1108")).toBe("日曜\n");
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
