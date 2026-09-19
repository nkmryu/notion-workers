import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import type { RecordedCall } from "./testing";

import { dailyOn, periodPageOf } from "../domain/testing";
import { monthly } from "../domain/monthly";
import { weekly } from "../domain/weekly";
import { runMaintenance } from "./run-maintenance";
import { createFakeDiary, noPageTitles } from "./testing";

// 2026-08-01（土）: 26.M07 が終わった翌月 1 日。26.W31 は進行中（8/1 は土曜）。
const firstOfAugust = Temporal.PlainDate.from("2026-08-01");

function methods(calls: readonly RecordedCall[]): readonly string[] {
  return calls.map(function (call) {
    return call.method;
  });
}

describe("runMaintenance: 月が変わった最初の実行", () => {
  const julyDailies = [
    dailyOn("2026-07-30", { id: "d-0730" }),
    dailyOn("2026-07-31", { id: "d-0731" }),
    dailyOn("2026-08-01", { id: "d-0801" }),
  ];
  const markdown = {
    "d-0730": "本文 [記事A](https://example.com/a)\n",
    "d-0731": "本文 [記事B](https://example.com/b)\n",
  };

  it("Monthly を作成 → 全日を転記 → Refs → リネーム → ロックの順に 1 回の実行で進める", async () => {
    // README が約束する「月が変わった最初の実行で前月分が閉じるまで進む」手順と順序を保証する。
    const diary = createFakeDiary({
      dailies: julyDailies,
      weeklies: [periodPageOf(weekly, { year: 2026, week: 31 })],
      markdown,
    });

    const summary = await runMaintenance({ diary, pageTitles: noPageTitles }, firstOfAugust);

    expect(methods(diary.calls)).toEqual([
      "lockPage", // d-0730
      "lockPage", // d-0731
      "appendMarkdown", // 進行中の 26.W31 へ 7/30 の転記
      "appendMarkdown", // 同 7/31
      "createPeriodPage", // 26.M07
      "appendMarkdown", // 7/30 の転記
      "appendMarkdown", // 7/31 の転記
      "appendMarkdown", // Refs
      "renamePage", // 作成直後のタイトル確定
      "lockPage", // 26.M07
    ]);
    expect(diary.calls[4]).toEqual({ method: "createPeriodPage", type: "monthly", title: "26.M07" });
    expect(diary.markdownOf("monthly-26.M07")).toContain(
      "## Refs\n- [記事A](https://example.com/a)\n- [記事B](https://example.com/b)",
    );
    expect(summary.monthly).toMatchObject({ created: 1, daysTransferred: 2, renames: 1, locks: 1 });
    expect(summary.monthly.refs.generated).toBe(1);
  });

  it("Refs の追記が失敗したら、その月をロックせずに実行を止める", async () => {
    // 閉じる前の工程が終わらない限りロックしないことを保証する。
    const diary = createFakeDiary({
      dailies: julyDailies,
      markdown,
      rejectAppend(_pageId, content) {
        return content.includes("## Refs") ? new Error("Refs の追記に失敗") : null;
      },
    });

    await expect(runMaintenance({ diary, pageTitles: noPageTitles }, firstOfAugust)).rejects.toThrow(
      "Refs の追記に失敗",
    );
    expect(methods(diary.calls).filter((m) => m === "lockPage")).toEqual(["lockPage", "lockPage"]); // Daily 2 件だけ
  });

  it("Refs 済みの月には再追記せず、リネームとロックだけ行う", async () => {
    // Refs 見出しを冪等キーとして二重生成しないことを保証する。
    const july = periodPageOf(monthly, Temporal.PlainYearMonth.from({ year: 2026, month: 7 }), {
      id: "m-07",
      title: "26.M07",
    });
    const diary = createFakeDiary({
      dailies: julyDailies,
      monthlies: [july],
      markdown: {
        ...markdown,
        "m-07": "---\n## 26.07.30（木）\n本文\n---\n## 26.07.31（金）\n本文\n---\n## Refs\n- [x](https://example.com/x)\n",
      },
    });

    const summary = await runMaintenance({ diary, pageTitles: noPageTitles }, firstOfAugust);

    expect(methods(diary.calls)).toEqual(["lockPage", "lockPage", "lockPage"]);
    expect(diary.calls[2]).toEqual({ method: "lockPage", pageId: "m-07" });
    expect(summary.monthly.refs).toMatchObject({ generated: 0, processed: 0 });
  });

  it("転記した日は同じ実行のロック判定へ反映され、次回は転記済みとして読める", async () => {
    // 転記が揃った月を同じ実行で閉じ、追記した見出しが次回の転記状態になることを保証する。
    const diary = createFakeDiary({ dailies: julyDailies, markdown });

    await runMaintenance({ diary, pageTitles: noPageTitles }, firstOfAugust);

    expect(await diary.getSectionTitles("monthly-26.M07")).toEqual([
      "26.07.30（木）",
      "26.07.31（金）",
      "Refs",
    ]);
  });
});

describe("runMaintenance: 週が変わった最初の実行", () => {
  it("Weekly を作成 → 転記 → リネーム → ロックまで 1 回の実行で進める", async () => {
    // 週次には Refs が無く、作成した実行で閉じるところまで進むことを保証する。
    const monday = Temporal.PlainDate.from("2026-07-27");
    const diary = createFakeDiary({
      dailies: [dailyOn("2026-07-25", { id: "d-0725", isLocked: true }), dailyOn("2026-07-26", { id: "d-0726" }), dailyOn("2026-07-27", { id: "d-0727" })],
      monthlies: [periodPageOf(monthly, Temporal.PlainYearMonth.from({ year: 2026, month: 7 }), { id: "m-07" })],
      markdown: { "d-0725": "土曜\n", "d-0726": "日曜\n" },
    });

    const summary = await runMaintenance({ diary, pageTitles: noPageTitles }, monday);

    expect(methods(diary.calls)).toEqual([
      "lockPage", // d-0726
      "createPeriodPage", // 26.W30
      "appendMarkdown", // 7/25
      "appendMarkdown", // 7/26
      "renamePage",
      "lockPage", // 26.W30
      "appendMarkdown", // Monthly 26.M07 への 7/25
      "appendMarkdown", // 7/26
    ]);
    expect(summary.weekly).toMatchObject({ created: 1, daysTransferred: 2, renames: 1, locks: 1 });
    expect(summary.monthly).toMatchObject({ created: 0, daysTransferred: 2, locks: 0 });
  });
});
