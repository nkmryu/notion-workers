import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import type { IsoWeek } from "./iso-week";
import type { DailyPage, PeriodArchive } from "./page";

import { parseDailyTitle } from "./daily-title";
import { monthly } from "./monthly";
import { planTransfers } from "./transfer-plan";
import { weekly } from "./weekly";

type DailyFixture = Pick<DailyPage, "id" | "createdTime" | "date">;

const today = Temporal.PlainDate.from("2026-07-22");

function daily(
  id: string,
  title: string,
  createdTime = "2026-07-22T01:00:00.000Z",
): DailyFixture {
  const date = parseDailyTitle(title);

  if (date === null) {
    throw new Error(`テスト用タイトルが日付形式ではありません: ${title}`);
  }

  return { id, createdTime, date };
}

function weeklyPage(
  week: number,
  transferredDates: readonly Temporal.PlainDate[] = [],
  isLocked = false,
): PeriodArchive<IsoWeek> {
  return {
    id: `weekly-${week}`,
    key: { year: 2026, week },
    title: `26.W${week}`,
    isLocked,
    transferredDates,
    hasRefs: false,
  };
}

describe("Weekly への転記計画", () => {
  it("転記済み見出しがある日をスキップする", () => {
    // 日付見出しが存在すれば同じ日の全Dailyを重複転記しないことを保証する。
    expect(
      planTransfers(
        weekly,

        [daily("daily-20", "26.07.20（月）")],
        [weeklyPage(30, [Temporal.PlainDate.from("2026-07-20")])],
        today,
      ),
    ).toEqual([]);
  });

  it("同じISO週のweeklyが無い日をスキップする", () => {
    // 転記先が存在しない日の本文を別の週へ書き込まないことを保証する。
    expect(
      planTransfers(
        weekly,
[daily("daily-13", "26.07.13（月）")], [], today),
    ).toEqual([]);
  });

  it("ロック済みweeklyへの転記をスキップする", () => {
    // 閉じた週次ページを更新対象にしないことを保証する。
    expect(
      planTransfers(
        weekly,

        [daily("daily-13", "26.07.13（月）")],
        [weeklyPage(29, [], true)],
        today,
      ),
    ).toEqual([]);
  });

  it("タイトルの日が今日のDailyをスキップする", () => {
    // 作成日が過去でも終了していない当日の本文を転記しないことを保証する。
    expect(
      planTransfers(
        weekly,

        [
          daily(
            "daily-today",
            "26.07.22（水）",
            "2024-01-01T00:00:00.000Z",
          ),
        ],
        [weeklyPage(30)],
        today,
      ),
    ).toEqual([]);
  });

  it("複数日をタイトルの日の昇順で返す", () => {
    // 作成日の前後関係に依存せず日付見出しを暦日順で追記することを保証する。
    expect(
      planTransfers(
        weekly,

        [
          daily(
            "daily-21",
            "26.07.21（火）",
            "2024-01-01T00:00:00.000Z",
          ),
          daily(
            "daily-20",
            "26.07.20（月）",
            "2026-07-22T01:00:00.000Z",
          ),
        ],
        [weeklyPage(30)],
        today,
      ),
    ).toEqual([
      {
        periodType: "weekly",
        destinationPageId: "weekly-30",
        date: Temporal.PlainDate.from("2026-07-20"),
        dailyPageIds: ["daily-20"],
        title: "26.07.20（月）",
      },
      {
        periodType: "weekly",
        destinationPageId: "weekly-30",
        date: Temporal.PlainDate.from("2026-07-21"),
        dailyPageIds: ["daily-21"],
        title: "26.07.21（火）",
      },
    ]);
  });

  it("同じ日の複数Dailyをcreated_time順で1見出しへまとめる", () => {
    // 同じ日付の全ページ本文を1つの冪等単位として順序どおり転記することを保証する。
    expect(
      planTransfers(
        weekly,

        [
          daily(
            "daily-later",
            "26.07.20（月）",
            "2026-07-20T02:00:00.000Z",
          ),
          daily(
            "daily-earlier",
            "26.07.20（月）",
            "2026-07-20T01:00:00.000Z",
          ),
        ],
        [weeklyPage(30)],
        today,
      ),
    ).toEqual([
      {
        periodType: "weekly",
        destinationPageId: "weekly-30",
        date: Temporal.PlainDate.from("2026-07-20"),
        dailyPageIds: ["daily-earlier", "daily-later"],
        title: "26.07.20（月）",
      },
    ]);
  });

  it("対象が7日あればすべてを日付昇順で返す", () => {
    // 1回の実行で保留分を残さず、古い日から順に転記を計画することを保証する。
    const dailies = [12, 11, 10, 9, 8, 7, 6].map(function (day) {
      const paddedDay = day.toString().padStart(2, "0");
      return daily(`daily-${day}`, `26.07.${paddedDay}（月）`);
    });

    expect(
      planTransfers(
        weekly,

        dailies,
        [weeklyPage(28)],
        Temporal.PlainDate.from("2026-07-13"),
      ).map(function (plan) {
        return plan.dailyPageIds[0];
      }),
    ).toEqual([
      "daily-6",
      "daily-7",
      "daily-8",
      "daily-9",
      "daily-10",
      "daily-11",
      "daily-12",
    ]);
  });
});

describe("Monthly への転記計画", () => {
  const monthlyPage: PeriodArchive<Temporal.PlainYearMonth> = {
    id: "monthly-07",
    key: Temporal.PlainYearMonth.from({ year: 2026, month: 7 }),
    title: "26.M07",
    isLocked: false,
    transferredDates: [],
    hasRefs: false,
  };

  it("Weeklyとは独立して同じDailyを同月Monthlyへ計画する", () => {
    // 週次転記済み見出しの有無が月次転記の冪等判定へ影響しないことを保証する。
    const pages = [daily("daily-20", "26.07.20（月）")];

    expect(
      planTransfers(
        weekly,
pages, [weeklyPage(30, [Temporal.PlainDate.from("2026-07-20")])], today),
    ).toEqual([]);
    expect(planTransfers(monthly, pages, [monthlyPage], today)).toEqual([
      {
        periodType: "monthly",
        destinationPageId: "monthly-07",
        date: Temporal.PlainDate.from("2026-07-20"),
        dailyPageIds: ["daily-20"],
        title: "26.07.20（月）",
      },
    ]);
  });
});
