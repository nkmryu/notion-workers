import { describe, expect, it } from "vitest";

import {
  decideWeeklyPageAction,
  planMissingWeeklyPages,
  shouldLockWeeklyPage,
} from "./weekly-page";

const now = new Date("2026-07-22T03:00:00.000Z");

describe("decideWeeklyPageAction", () => {
  it("今週作成された週次ページをリネームする", () => {
    // 今週の週次ページに期待する週次タイトルを指定することを保証する。
    expect(
      decideWeeklyPageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          currentTitle: "新規ページ",
          isWeekly: true,
        },
        now,
      ),
    ).toEqual({ type: "rename", title: "26.W30" });
  });

  it("今週作成されてリネーム済みの週次ページには何もしない", () => {
    // 週次ページへ不要な PATCH を重ねないことを保証する。
    expect(
      decideWeeklyPageAction(
        {
          createdTime: "2026-07-20T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.W30",
          isWeekly: true,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("先週作成された未ロックの週次ページをロックする", () => {
    // 転記完了が確認された過去週だけをロック対象にできることを保証する。
    expect(
      decideWeeklyPageAction(
        {
          createdTime: "2026-07-13T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.W29",
          isWeekly: true,
        },
        now,
        true,
      ),
    ).toEqual({ type: "lock" });
  });

  it("先週でも転記が完了していなければロックしない", () => {
    // 過去週という条件だけで未完了の週次ページを閉じないことを保証する。
    expect(
      decideWeeklyPageAction(
        {
          createdTime: "2026-07-13T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.W29",
          isWeekly: true,
        },
        now,
        false,
      ),
    ).toEqual({ type: "none" });
  });

  it("日次ページには何もしない", () => {
    // 日次ページを週次のリネーム・ロック対象にしないことを保証する。
    expect(
      decideWeeklyPageAction(
        {
          createdTime: "2026-07-13T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.07.13（月）",
          isWeekly: false,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });

  it("未来週に作成された週次ページには何もしない", () => {
    // 実行時点より未来の ISO 週に属するページを変更しないことを保証する。
    expect(
      decideWeeklyPageAction(
        {
          createdTime: "2026-07-27T03:00:00.000Z",
          isLocked: false,
          currentTitle: "26.W31",
          isWeekly: true,
        },
        now,
      ),
    ).toEqual({ type: "none" });
  });
});

describe("planMissingWeeklyPages", () => {
  it("weekly が無い daily の週を古い順にすべて返す", () => {
    // 未作成の過去週が複数あっても1回の実行で残さず作成対象にすることを保証する。
    expect(
      planMissingWeeklyPages(
        [
          {
            createdTime: "2026-07-13T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.13（月）",
          },
          {
            createdTime: "2026-06-29T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.06.29（月）",
          },
          {
            createdTime: "2026-07-06T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.06（月）",
          },
        ],
        now,
      ),
    ).toEqual([
      {
        week: { year: 2026, week: 27 },
        title: "26.W27",
        representativeCreatedTime: "2026-06-29T00:00:00.000Z",
      },
      {
        week: { year: 2026, week: 28 },
        title: "26.W28",
        representativeCreatedTime: "2026-07-06T00:00:00.000Z",
      },
      {
        week: { year: 2026, week: 29 },
        title: "26.W29",
        representativeCreatedTime: "2026-07-13T00:00:00.000Z",
      },
    ]);
  });

  it("weekly が既にある週は作成対象から除外する", () => {
    // タイトルが示す ISO 週に weekly があれば重複作成しないことを保証する。
    expect(
      planMissingWeeklyPages(
        [
          {
            createdTime: "2026-07-06T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.06（月）",
          },
          {
            createdTime: "2026-07-18T03:00:00.000Z",
            isWeekly: true,
            currentTitle: "26.W28",
          },
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("進行中の週は daily があっても作成対象にしない", () => {
    // Weekly を週の終了後にまとめて作成・転記・ロックする前提で、今週のページを先に作らないことを保証する。
    // now は 2026-07-22（水）= 26.W30。
    expect(
      planMissingWeeklyPages(
        [
          {
            createdTime: "2026-07-20T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.20（月）",
          },
          {
            createdTime: "2026-07-22T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.22（水）",
          },
          {
            createdTime: "2026-07-19T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.19（日）",
          },
        ],
        now,
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.W29"]);
  });

  it("週が変わった初日に前週を作成対象にする", () => {
    // 新しい週の最初の実行で前週分が作られ、同じ実行で転記とロックまで進めることを保証する。
    expect(
      planMissingWeeklyPages(
        [
          {
            createdTime: "2026-07-26T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.26（日）",
          },
          {
            createdTime: "2026-07-27T03:00:00.000Z",
            isWeekly: false,
            currentTitle: "26.07.27（月）",
          },
        ],
        new Date("2026-07-26T15:05:00.000Z"),
      ).map(function (plan) {
        return plan.title;
      }),
    ).toEqual(["26.W30"]);
  });

  it("daily が存在しない週は作成対象にしない", () => {
    // weekly だけがあるデータから別週のページを推測して作らないことを保証する。
    expect(
      planMissingWeeklyPages(
        [
          {
            createdTime: "2026-07-18T03:00:00.000Z",
            isWeekly: true,
            currentTitle: "26.W29",
          },
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("MonthlyをDailyとして週次作成の根拠にしない", () => {
    // 日付風タイトルのMonthlyがWeekly作成を誘発しないことを保証する。
    expect(
      planMissingWeeklyPages(
        [
          {
            createdTime: "2026-07-18T03:00:00.000Z",
            isWeekly: false,
            isMonthly: true,
            currentTitle: "26.07.13（月）",
          },
        ],
        now,
      ),
    ).toEqual([]);
  });

  it("作成日と異なるタイトルの日のISO週へdailyを帰属させる", () => {
    // インポート時の作成日に偏らずタイトル日が属する過去週を作成対象にすることを保証する。
    expect(
      planMissingWeeklyPages(
        [
          {
            createdTime: "2026-07-22T01:00:00.000Z",
            isWeekly: false,
            currentTitle: "24.12.30（月）",
          },
          {
            createdTime: "2024-12-30T01:00:00.000Z",
            isWeekly: false,
            currentTitle: "移行メモ",
          },
        ],
        now,
      ),
    ).toEqual([
      {
        week: { year: 2025, week: 1 },
        title: "25.W01",
        representativeCreatedTime: "2024-12-30T00:00:00.000Z",
      },
    ]);
  });
});

describe("shouldLockWeeklyPage", () => {
  const weekly = {
    createdTime: "2026-07-13T00:00:00.000Z",
    isLocked: false,
    currentTitle: "26.W29",
    isWeekly: true,
  };
  const dailies = [
    {
      createdTime: "2026-07-13T03:00:00.000Z",
      currentTitle: "26.07.13（月）",
      isWeekly: false,
    },
    {
      createdTime: "2026-07-14T03:00:00.000Z",
      currentTitle: "26.07.14（火）",
      isWeekly: false,
    },
  ];

  it("その週の全 daily が転記済みなら過去週をロックする", () => {
    // 過去週の全期待見出しが存在するときだけ完了と判定することを保証する。
    expect(
      shouldLockWeeklyPage(
        weekly,
        dailies,
        ["26.07.13（月）", "26.07.14（火）"],
        now,
      ),
    ).toBe(true);
  });

  it("未転記の daily が残る過去週をロックしない", () => {
    // 1日でも期待見出しが欠けていれば次回転記可能な状態を保つことを保証する。
    expect(
      shouldLockWeeklyPage(weekly, dailies, ["26.07.13（月）"], now),
    ).toBe(false);
  });

  it("全 daily が転記済みでも今週はロックしない", () => {
    // 進行中の週は転記完了数にかかわらず閉じないことを保証する。
    expect(
      shouldLockWeeklyPage(
        {
          ...weekly,
          createdTime: "2026-07-20T00:00:00.000Z",
          currentTitle: "26.W30",
        },
        [
          {
            createdTime: "2026-07-20T03:00:00.000Z",
            currentTitle: "26.07.20（月）",
            isWeekly: false,
          },
        ],
        ["26.07.20（月）"],
        now,
      ),
    ).toBe(false);
  });

  it("同じ週のロック済みメモを完了条件へ含めない", () => {
    // メモに対応する見出しがなくても全Daily転記済みなら週次をロックできることを保証する。
    expect(
      shouldLockWeeklyPage(
        weekly,
        [
          ...dailies,
          {
            createdTime: "2026-07-15T03:00:00.000Z",
            currentTitle: "週のメモ",
            isWeekly: false,
          },
        ],
        ["26.07.13（月）", "26.07.14（火）"],
        now,
      ),
    ).toBe(true);
  });
});
