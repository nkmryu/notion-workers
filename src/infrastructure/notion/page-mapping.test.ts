import type {
  DataSourceObjectResponse,
  PageObjectResponse,
} from "@notionhq/client";

import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import {
  createTitleProperty,
  parseDataSourceTitleKey,
  toDailyPage,
  toHabitPage,
} from "./page-mapping";

// SDK のレスポンス型は全フィールド必須なので、テストで検証する項目だけを持つ最小フィクスチャを型へ合わせる。
function createRow(
  title: string,
  overrides: Readonly<Record<string, unknown>> = {},
): PageObjectResponse {
  return {
    object: "page",
    id: "page-id",
    // isFullPage は url の有無で部分レスポンスと区別する。
    url: "https://www.notion.so/page-id",
    created_time: "2026-07-20T03:00:00.000Z",
    is_locked: false,
    properties: {
      Name: { type: "title", title: [{ plain_text: title }] },
    },
    ...overrides,
  } as unknown as PageObjectResponse;
}

function createDataSource(
  properties: Readonly<Record<string, unknown>>,
): DataSourceObjectResponse {
  return {
    object: "data_source",
    id: "data-source-id",
    properties,
  } as unknown as DataSourceObjectResponse;
}

describe("parseDataSourceTitleKey", () => {
  it("data source の title 型プロパティ名を返す", () => {
    // プロパティ名を決め打ちせず title 型から更新キーを得ることを保証する。
    expect(
      parseDataSourceTitleKey(
        createDataSource({ Status: { type: "select" }, 日付: { type: "title" } }),
      ),
    ).toBe("日付");
  });

  it("title 型プロパティが無い場合は失敗する", () => {
    // 不正な data source スキーマで誤ったページを作成しないことを保証する。
    expect(function () {
      parseDataSourceTitleKey(createDataSource({ Status: { type: "select" } }));
    }).toThrow("data source に title 型のプロパティがありません");
  });
});

describe("toDailyPage", () => {
  it("タイトルの日付を日付キーにし、作成日は使わない", () => {
    // インポートで作成日が偏っていてもタイトルが示す日を業務日として採用することを保証する。
    expect(
      toDailyPage(
        createRow("24.12.30（月）", { id: "daily", is_locked: true }),
      ),
    ).toMatchObject({
      id: "daily",
      createdAt: Temporal.Instant.from("2026-07-20T03:00:00.000Z"),
      title: "24.12.30（月）",
      isLocked: true,
      date: Temporal.PlainDate.from("2024-12-30"),
    });
  });

  it("複数の rich_text からなるタイトルを連結する", () => {
    // 分割されたタイトルでも日付を読めることを保証する。
    const row = createRow("", {
      properties: {
        Name: { type: "title", title: [{ plain_text: "26.07." }, { plain_text: "20（月）" }] },
      },
    });

    expect(toDailyPage(row)).toMatchObject({ title: "26.07.20（月）", date: Temporal.PlainDate.from("2026-07-20") });
  });

  it("空タイトルなら作成日（JST）を日付キーにする", () => {
    // テンプレート適用前の空タイトルでも今日の Daily として扱えることを保証する。
    expect(toDailyPage(createRow("", { created_time: "2026-07-21T15:00:00.000Z" }))).toMatchObject(
      { date: Temporal.PlainDate.from("2026-07-22") },
    );
  });

  it("日付でも空でもないタイトルは失敗する", () => {
    // Daily 種別のページにメモのタイトルが付いた不整合を黙って処理しないことを保証する。
    expect(function () {
      toDailyPage(createRow("メモ"));
    }).toThrow("Daily のタイトルが日付形式ではありません: メモ");
  });

  it("ページ詳細以外の行は失敗する", () => {
    // 部分レスポンスを空タイトルの Daily として誤処理しないことを保証する。
    const row = { object: "page", id: "partial" } as unknown as PageObjectResponse;

    expect(function () {
      toDailyPage(row);
    }).toThrow("query 結果にページ以外が含まれています: partial");
  });
});

describe("toHabitPage", () => {
  it("タイトルの日付を習慣ページの日付にする", () => {
    // 習慣データベースの行を、タイトルが示す日の習慣ページとして読むことを保証する。
    expect(toHabitPage(createRow("26.07.22（水）", { id: "habit" }))).toMatchObject({
      id: "habit",
      title: "26.07.22（水）",
      date: Temporal.PlainDate.from("2026-07-22"),
    });
  });

  it("日付として読めないタイトルの行は、日付を持たない習慣ページにする", () => {
    // 種別の列が無い習慣データベースで、メモの行を失敗させないことを保証する。
    expect(toHabitPage(createRow("メモ")).date).toBeNull();
  });

  it("ページ詳細以外の行は失敗する", () => {
    // 部分レスポンスを日付の無い行として黙って読み飛ばさないことを保証する。
    const row = { object: "page", id: "partial" } as unknown as PageObjectResponse;

    expect(function () {
      toHabitPage(row);
    }).toThrow("query 結果にページ以外が含まれています: partial");
  });
});

describe("createTitleProperty", () => {
  it("タイトルを 1 つの text として送る形にする", () => {
    // ページ作成とリネームで Notion が受け付けるタイトルの形を保証する。
    expect(createTitleProperty("26.07.22（水）")).toEqual({
      title: [{ type: "text", text: { content: "26.07.22（水）" } }],
    });
  });
});
