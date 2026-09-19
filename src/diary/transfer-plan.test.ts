import { describe, expect, it } from "vitest";

import type { CalendarMonth } from "./calendar-month";
import type { IsoWeek } from "./iso-week";
import type { DiaryPage } from "./page";
import type { TransferDestination } from "./transfer-plan";

import { monthly } from "./monthly";
import { planTransfers } from "./transfer-plan";
import { weekly } from "./weekly";

type DailyFixture = Pick<DiaryPage, "id" | "createdTime" | "title" | "periodType">;

const now = new Date("2026-07-22T03:00:00.000Z");

function daily(
  id: string,
  title: string,
  createdTime = "2026-07-22T01:00:00.000Z",
): DailyFixture {
  return { id, createdTime, title: title, periodType: null };
}

function weeklyPage(
  week: number,
  headingTitles: readonly string[] = [],
  isLocked = false,
): TransferDestination<IsoWeek> {
  return {
    id: `weekly-${week}`,
    key: { year: 2026, week },
    isLocked,
    headingTitles,
  };
}

describe("Weekly への転記計画", () => {
  it("転記済み見出しがある日をスキップする", () => {
    // 日付見出しが存在すれば同じ日の全Dailyを重複転記しないことを保証する。
    expect(
      planTransfers(
        weekly,

        [daily("daily-20", "26.07.20（月）")],
        [weeklyPage(30, ["26.07.20（月）"])],
        now,
      ),
    ).toEqual([]);
  });

  it("同じISO週のweeklyが無い日をスキップする", () => {
    // 転記先が存在しない日の本文を別の週へ書き込まないことを保証する。
    expect(
      planTransfers(
        weekly,
[daily("daily-13", "26.07.13（月）")], [], now),
    ).toEqual([]);
  });

  it("ロック済みweeklyへの転記をスキップする", () => {
    // 閉じた週次ページを更新対象にしないことを保証する。
    expect(
      planTransfers(
        weekly,

        [daily("daily-13", "26.07.13（月）")],
        [weeklyPage(29, [], true)],
        now,
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
        now,
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
        now,
      ),
    ).toEqual([
      {
        periodType: "weekly",

        destinationPageId: "weekly-30",

        dailyPageIds: ["daily-20"],
        title: "26.07.20（月）",
      },
      {
        periodType: "weekly",

        destinationPageId: "weekly-30",

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
        now,
      ),
    ).toEqual([
      {
        periodType: "weekly",

        destinationPageId: "weekly-30",

        dailyPageIds: ["daily-earlier", "daily-later"],
        title: "26.07.20（月）",
      },
    ]);
  });

  it("メモを転記計画へ含めない", () => {
    // 過去作成かつ未ロックでも非日付タイトルのページ本文を転記しないことを保証する。
    expect(
      planTransfers(
        weekly,

        [
          daily(
            "memo",
            "読書メモ",
            "2026-07-20T01:00:00.000Z",
          ),
        ],
        [weeklyPage(30)],
        now,
      ),
    ).toEqual([]);
  });

  it("MonthlyをWeekly転記の元ページに含めない", () => {
    // 日付風タイトルでもMonthlyページをDaily本文として週次へ転記しないことを保証する。
    expect(
      planTransfers(
        weekly,

        [
          {
            ...daily("monthly", "26.07.20（月）"),
            periodType: "monthly" as const,
          },
        ],
        [weeklyPage(30)],
        now,
      ),
    ).toEqual([]);
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
        new Date("2026-07-13T03:00:00.000Z"),
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
  const monthlyPage: TransferDestination<CalendarMonth> = {
    id: "monthly-07",
    key: { year: 2026, month: 7 },
    isLocked: false,
    headingTitles: [],
  };

  it("Weeklyとは独立して同じDailyを同月Monthlyへ計画する", () => {
    // 週次転記済み見出しの有無が月次転記の冪等判定へ影響しないことを保証する。
    const pages = [daily("daily-20", "26.07.20（月）")];

    expect(
      planTransfers(
        weekly,
pages, [weeklyPage(30, ["26.07.20（月）"])], now),
    ).toEqual([]);
    expect(planTransfers(monthly, pages, [monthlyPage], now)).toEqual([
      {
        periodType: "monthly",

        destinationPageId: "monthly-07",

        dailyPageIds: ["daily-20"],
        title: "26.07.20（月）",
      },
    ]);
  });

  it("WeeklyやMonthlyを月次転記元へ含めない", () => {
    // 定期ページ同士の本文をDailyとして月次へ混入させないことを保証する。
    expect(
      planTransfers(
        monthly,
        [
          { ...daily("weekly", "26.07.20（月）"), periodType: "weekly" as const },
          { ...daily("monthly", "26.07.20（月）"), periodType: "monthly" as const },
        ],
        [monthlyPage],
        now,
      ),
    ).toEqual([]);
  });
});
