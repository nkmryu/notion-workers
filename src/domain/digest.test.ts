import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { PAGE_ACTION_TYPE } from "./page";
import {
  DIGEST_KIND,
  DigestPeriod,
  DigestTarget,
  WEEKLY_CLEANUP,
  decideWeeklyCleanup,
  deriveDigestState,
  extractOwnBody,
  findClosingDaily,
  listAwaitingClosingDailies,
  listDueDigestPeriods,
  planMissingClosingDailies,
} from "./digest";
import { dailyOn } from "./testing";

const date = Temporal.PlainDate.from;

function describePeriods(periods: readonly DigestPeriod[]): readonly string[] {
  return periods.map(function (period) {
    return `${period.label}@${period.closingDate.toString()}`;
  });
}

describe("DigestPeriod", () => {
  it("週は日曜、月は月末を締めの日にする", () => {
    // 週のまとめを日曜の Daily へ、月のまとめを月末の Daily へ置くことを保証する。
    expect(DigestPeriod.weekOf(date("2026-11-10")).closingDate).toEqual(date("2026-11-15"));
    expect(DigestPeriod.weekOf(date("2026-11-15")).closingDate).toEqual(date("2026-11-15"));
    expect(DigestPeriod.monthOf(date("2026-02-10")).closingDate).toEqual(date("2026-02-28"));
  });

  it("見出しは旧 Weekly / Monthly のタイトルと同じ形にする", () => {
    // 旧ページのタイトルで Notion を検索して、まとめの置き場へ辿れることを保証する。
    expect(DigestPeriod.weekOf(date("2026-11-10")).label).toBe("26.W46");
    expect(DigestPeriod.monthOf(date("2026-11-10")).label).toBe("26.M11");
  });

  it("年をまたぐ ISO 週は、木曜が属する年で数える", () => {
    // 2026-12-28〜2027-01-03 の週を 27.W53 ではなく 26.W53 とすることを保証する。
    expect(DigestPeriod.weekOf(date("2026-12-31")).label).toBe("26.W53");
    expect(DigestPeriod.weekOf(date("2026-12-31")).closingDate).toEqual(date("2027-01-03"));
  });

  it("締めの日が終わってから、終わった期間とみなす", () => {
    // 締めの日の当日は、その日の本文が書きかけなのでまとめを書かないことを保証する。
    const week = DigestPeriod.weekOf(date("2026-11-15"));

    expect(week.isEnded(date("2026-11-15"))).toBe(false);
    expect(week.isEnded(date("2026-11-16"))).toBe(true);
  });

  it("月をまたぐ週は、日曜と同じ月の日だけを含む", () => {
    // 前の月の日を週のまとめへ写さず、その月のまとめだけに入れることを保証する。
    // 26.W44 は 2026-10-26〜11-01、26.W49 は 2026-11-30〜12-06。
    const w44 = DigestPeriod.weekOf(date("2026-11-01"));
    const w49 = DigestPeriod.weekOf(date("2026-12-06"));

    expect(w44.contains(date("2026-10-31"))).toBe(false);
    expect(w44.contains(date("2026-11-01"))).toBe(true);
    expect(w49.contains(date("2026-11-30"))).toBe(false);
    expect(w49.contains(date("2026-12-01"))).toBe(true);
  });

  it("週のまとめは今月の週だけ、月のまとめは終わった月すべてで書く", () => {
    // 月が変わってから、前の月の週のまとめを書き足さないことを保証する。
    const w48 = DigestPeriod.weekOf(date("2026-11-29"));
    const m11 = DigestPeriod.monthOf(date("2026-11-30"));

    expect(w48.isDue(date("2026-11-30"))).toBe(true);
    expect(w48.isDue(date("2026-12-01"))).toBe(false);
    expect(m11.isDue(date("2026-12-01"))).toBe(true);
    expect(m11.isDue(date("2027-03-01"))).toBe(true);
  });
});

describe("listDueDigestPeriods", () => {
  it("Daily のある期間のうち、書く時期が来たものを日付順に 1 つずつ返す", () => {
    // 同じ期間を二重に扱わず、進行中の週・月のまとめを書かないことを保証する。
    const dailies = [dailyOn("2026-11-09"), dailyOn("2026-11-10"), dailyOn("2026-11-16")];

    expect(describePeriods(listDueDigestPeriods(dailies, date("2026-11-17")))).toEqual([
      "26.W46@2026-11-15",
    ]);
  });

  it("前の月の日は、週ではなく月の期間に入れる", () => {
    // 前の月の週のまとめを書かず、月のまとめだけを書くことを保証する。
    const dailies = [dailyOn("2026-10-20"), dailyOn("2026-10-27"), dailyOn("2026-11-03")];

    expect(describePeriods(listDueDigestPeriods(dailies, date("2026-11-09")))).toEqual([
      "26.M10@2026-10-31",
      "26.W45@2026-11-08",
    ]);
  });

  it("日曜が月末と重なる週は、月のまとめだけにする", () => {
    // 同じ本文を 1 ページに 2 回並べないことを保証する。2026-05-31 は日曜で月末。
    const dailies = [dailyOn("2026-05-25"), dailyOn("2026-05-31")];

    expect(describePeriods(listDueDigestPeriods(dailies, date("2026-06-01")))).toEqual([
      "26.M05@2026-05-31",
    ]);
  });
});

describe("締めの日の Daily", () => {
  it("同じ日に複数あれば、最初に作られた Daily を置き場にする", () => {
    // 同日の重複ページがあっても、まとめの置き場が実行ごとに変わらないことを保証する。
    const later = dailyOn("2026-11-15", { id: "later", createdTime: "2026-11-15T03:00:00.000Z" });
    const earlier = dailyOn("2026-11-15", { id: "earlier", createdTime: "2026-11-14T20:00:00.000Z" });

    expect(findClosingDaily(DigestPeriod.weekOf(date("2026-11-15")), [later, earlier])?.id).toBe("earlier");
  });

  it("終わった期間の締めの日に Daily が無ければ、その日付で作る計画にする", () => {
    // 日曜や月末を書かなかった期間にも、まとめの置き場を用意することを保証する。
    const dailies = [dailyOn("2026-11-13")];

    expect(planMissingClosingDailies(dailies, date("2026-11-17"))).toEqual([
      { title: "26.11.15（日）", date: date("2026-11-15") },
    ]);
  });

  it("締めの日の Daily だけの期間には、別の種類の締めの日を作らない", () => {
    // 作った月末の Daily が週を、作った日曜の Daily が月を生み、締めの日を作り続ける連鎖を起こさないことを保証する。
    // 2025-06-30 は月曜の月末、2025-07-06 は日曜。
    expect(planMissingClosingDailies([dailyOn("2025-06-30")], date("2025-07-07"))).toEqual([]);
    expect(planMissingClosingDailies([dailyOn("2025-07-06")], date("2025-08-01"))).toEqual([]);
  });

  it("前の月の日だけの週には、日曜の Daily を作らない", () => {
    // 月をまたぐ週で、写す日の無い週のまとめの置き場を作らないことを保証する。2026-11-01 は 26.W44 の日曜。
    expect(planMissingClosingDailies([dailyOn("2026-10-27")], date("2026-11-02"))).toEqual([
      { title: "26.10.31（土）", date: date("2026-10-31") },
    ]);
  });

  it("まとめを書き終えていない締めの日の Daily だけを、ロックを待つ Daily として返す", () => {
    // ロック済みの締めの日は済んだものとし、Daily の段階で閉じてしまわない対象を絞ることを保証する。
    const dailies = [
      dailyOn("2026-11-08", { id: "done", isLocked: true }),
      dailyOn("2026-11-14", { id: "saturday" }),
      dailyOn("2026-11-15", { id: "sunday" }),
    ];

    expect(listAwaitingClosingDailies(dailies, date("2026-11-16")).map((daily) => daily.id)).toEqual([
      "sunday",
    ]);
  });
});

describe("extractOwnBody", () => {
  it("締めの日の Daily は、そのページが持つまとめを除いた本文にする", () => {
    // 日曜の Daily を月のまとめへ写すとき、日曜が持つ週のまとめまで写して入れ子にしないことを保証する。
    const sunday = "日曜の本文\n# 26.W45\n## 26.11.02（月）\n---\n月曜\n<empty-block/>\n";

    expect(extractOwnBody(sunday, date("2026-11-08"))).toBe("日曜の本文\n");
  });

  it("月末の Daily は月のまとめの見出しで切る", () => {
    // 月末の Daily を週のまとめへ写すとき、月のまとめを写さないことを保証する。
    expect(extractOwnBody("金曜\n# 26.M10\n## Refs\n", date("2026-10-31"))).toBe("金曜\n");
  });

  it("締めの日でない日は、本文をそのまま返す", () => {
    // 本文に見出し 1 があっても、ふつうの日の本文を削らないことを保証する。
    expect(extractOwnBody("火曜\n# 26.W45\n", date("2026-11-03"))).toBe("火曜\n# 26.W45\n");
  });
});

describe("decideWeeklyCleanup", () => {
  it("週のまとめが無ければ何もせず、本文があればまとめだけを消し、本文が空ならゴミ箱へ移す", () => {
    // 消し終えた日曜を二度消さず、書いた本文を消さず、空の日曜だけを捨てることを保証する。
    expect(decideWeeklyCleanup(null)).toEqual({ type: WEEKLY_CLEANUP.none });
    expect(decideWeeklyCleanup({ ownBody: "日曜の本文", digest: "# 26.W46\n" })).toEqual({
      type: WEEKLY_CLEANUP.removeDigest,
      digest: "# 26.W46\n",
    });
    expect(decideWeeklyCleanup({ ownBody: "<empty-block/>\n---", digest: "# 26.W46\n" })).toEqual({
      type: WEEKLY_CLEANUP.trashPage,
    });
  });
});

describe("deriveDigestState", () => {
  it("まとめの見出しが無ければ、何も書いていない状態にする", () => {
    // 最初に書くときにまとめの見出しを置くことを保証する。
    expect(deriveDigestState(null)).toEqual({ hasHeader: false, transferredDates: [], hasRefs: false });
  });

  it("日付見出しを転記済みの日、Refs 見出しを Refs ありとして読む", () => {
    // 見出しを冪等キーにして、同じ日や Refs を二重に書かないことを保証する。
    expect(deriveDigestState(["26.11.09（月）", "20:57", "Refs"])).toEqual({
      hasHeader: true,
      transferredDates: [date("2026-11-09")],
      hasRefs: true,
    });
  });
});

describe("DigestTarget", () => {
  const week = DigestPeriod.weekOf(date("2026-11-15"));
  const sunday = dailyOn("2026-11-15", { id: "sunday" });
  const empty = deriveDigestState(null);

  it("置き場の Daily 自身を除き、まだ写していない日を日付順に計画する", () => {
    // 日曜の本文を日曜のページへ写し直さず、同じ日の Daily は 1 つの見出しの下へ並べることを保証する。
    const dailies = [
      sunday,
      dailyOn("2026-11-10", { id: "tue" }),
      dailyOn("2026-11-09", { id: "mon-2", createdTime: "2026-11-09T05:00:00.000Z" }),
      dailyOn("2026-11-09", { id: "mon-1", createdTime: "2026-11-09T01:00:00.000Z" }),
      dailyOn("2026-11-16", { id: "next-week" }),
    ];
    const target = new DigestTarget(week, sunday, { ...empty, hasHeader: true, transferredDates: [date("2026-11-10")] });

    expect(target.planTransfers(dailies)).toEqual([
      { date: date("2026-11-09"), heading: "26.11.09（月）", dailyPageIds: ["mon-1", "mon-2"] },
    ]);
  });

  it("期間の全日を写し終えるまでロックしない", () => {
    // 転記の途中で締めの日の Daily を閉じないことを保証する。
    const dailies = [sunday, dailyOn("2026-11-09", { id: "mon" }), dailyOn("2026-11-10", { id: "tue" })];
    const partial = new DigestTarget(week, sunday, empty).withTransferred(date("2026-11-09"));

    expect(partial.decideActions(dailies)).toEqual([]);
    expect(partial.withTransferred(date("2026-11-10")).decideActions(dailies)).toEqual([
      { type: PAGE_ACTION_TYPE.lock },
    ]);
  });

  it("Refs は月のまとめで、まだ無いときだけ求める", () => {
    // 週のまとめに Refs を書かず、月の Refs を二重に書かないことを保証する。
    const month = DigestPeriod.monthOf(date("2026-11-30"));
    const monthEnd = dailyOn("2026-11-30", { id: "month-end" });

    expect(month.kind).toBe(DIGEST_KIND.monthly);
    expect(new DigestTarget(week, sunday, empty).needsRefs).toBe(false);
    expect(new DigestTarget(month, monthEnd, empty).needsRefs).toBe(true);
    expect(new DigestTarget(month, monthEnd, empty).withRefs().needsRefs).toBe(false);
  });

  it("月のまとめを写し終えたら、その月の日曜にある週のまとめを置き換える対象にする", () => {
    // 写し終える前に週のまとめを消さず、月末の日曜（月のまとめの置き場）は対象にしないことを保証する。
    // 2026-05: 05-03・05-10 は日曜、05-31 は日曜で月末。
    const month = DigestPeriod.monthOf(date("2026-05-31"));
    const monthEnd = dailyOn("2026-05-31", { id: "month-end" });
    const dailies = [
      monthEnd,
      dailyOn("2026-05-01", { id: "fri" }),
      dailyOn("2026-05-03", { id: "sun-1" }),
      dailyOn("2026-05-10", { id: "sun-2" }),
    ];
    const partial = new DigestTarget(month, monthEnd, empty).withTransferred(date("2026-05-01"));
    const complete = partial.withTransferred(date("2026-05-03")).withTransferred(date("2026-05-10"));

    expect(partial.listReplacedWeeklyDigests(dailies)).toEqual([]);
    expect(complete.listReplacedWeeklyDigests(dailies)).toEqual([
      { dailyId: "sun-1", label: "26.W18" },
      { dailyId: "sun-2", label: "26.W19" },
    ]);
    expect(new DigestTarget(week, sunday, empty).listReplacedWeeklyDigests([sunday])).toEqual([]);
  });

  it("期間外の日を転記済みにしようとしたら失敗する", () => {
    // 別の週の日付が状態へ混ざる不整合を黙って通さないことを保証する。
    expect(function () {
      new DigestTarget(week, sunday, empty).withTransferred(date("2026-11-16"));
    }).toThrow("26.W46 の期間外の日付です: 2026-11-16");
  });
});
