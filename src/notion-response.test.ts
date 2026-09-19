import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  QueryDataSourceResponse,
} from "@notionhq/client";

import { describe, expect, it } from "vitest";

import { parseDataSourceTitleKey, parseQueryPage } from "./notion-response";

// SDK のレスポンス型は全フィールド必須なので、テストで検証する項目だけを持つ最小フィクスチャを型へ合わせる。
function createPage(
  properties: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>> = {},
): PageObjectResponse {
  return {
    object: "page",
    id: "page-id",
    // isFullPage は url の有無で部分レスポンスと区別する。
    url: "https://www.notion.so/page-id",
    created_time: "2026-07-20T03:00:00.000Z",
    is_locked: false,
    properties,
    ...overrides,
  } as unknown as PageObjectResponse;
}

function createQueryResponse(
  pages: readonly PageObjectResponse[],
): QueryDataSourceResponse {
  return {
    object: "list",
    type: "page_or_data_source",
    page_or_data_source: {},
    results: [...pages],
    has_more: false,
    next_cursor: null,
  } as unknown as QueryDataSourceResponse;
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
        createDataSource({
          Status: { type: "select" },
          日付: { type: "title" },
        }),
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

describe("parseQueryPage", () => {
  it("type select が Weekly のページを週次として解析する", () => {
    // 名前と値が一致する select プロパティから週次ページを識別することを保証する。
    expect(
      parseQueryPage(
        createQueryResponse([
          createPage({
            Name: { type: "title", title: [{ plain_text: "26.W30" }] },
            type: { type: "select", select: { name: "Weekly" } },
          }),
        ]),
      ).pages[0]?.isWeekly,
    ).toBe(true);
  });

  it("type select が Monthly のページを月次として解析する", () => {
    // Notionの実表記Monthlyと厳密一致したページだけを月次として識別することを保証する。
    const page = parseQueryPage(
      createQueryResponse([
        createPage({
          Name: { type: "title", title: [{ plain_text: "26.M07" }] },
          type: { type: "select", select: { name: "Monthly" } },
        }),
      ]),
    ).pages[0];

    expect(page).toMatchObject({ isWeekly: false, isMonthly: true });
  });

  it("タイトル・作成日時・ロック状態を取り出す", () => {
    // 分類とアクション決定に必要な項目を SDK レスポンスから欠けなく写すことを保証する。
    const page = parseQueryPage(
      createQueryResponse([
        createPage(
          {
            日付: {
              type: "title",
              title: [{ plain_text: "26.07." }, { plain_text: "20（月）" }],
            },
          },
          { id: "daily", is_locked: true },
        ),
      ]),
    ).pages[0];

    expect(page).toEqual({
      id: "daily",
      createdTime: "2026-07-20T03:00:00.000Z",
      isLocked: true,
      titleKey: "日付",
      currentTitle: "26.07.20（月）",
      isWeekly: false,
      isMonthly: false,
    });
  });

  it.each([
    ["プロパティなし", undefined],
    ["select 以外", { type: "rich_text", rich_text: [] }],
    ["値なし", { type: "select", select: null }],
    ["小文字の weekly", { type: "select", select: { name: "weekly" } }],
    ["Weekly 以外", { type: "select", select: { name: "daily" } }],
    ["小文字の monthly", { type: "select", select: { name: "monthly" } }],
  ])("type が%sなら定期ページとして解析しない", (_case, typeProperty) => {
    // WeeklyまたはMonthlyと厳密一致しないselectを定期ページへ誤分類しないことを保証する。
    const properties = {
      Name: { type: "title", title: [{ plain_text: "日誌" }] },
      ...(typeProperty === undefined ? {} : { type: typeProperty }),
    };

    const page = parseQueryPage(createQueryResponse([createPage(properties)]))
      .pages[0];

    expect(page).toMatchObject({ isWeekly: false, isMonthly: false });
  });

  it("結果にページ詳細以外が混ざると失敗する", () => {
    // 部分レスポンスを空タイトルの Daily 候補として誤処理しないことを保証する。
    const response = {
      ...createQueryResponse([]),
      results: [{ object: "page", id: "partial" }],
    } as unknown as QueryDataSourceResponse;

    expect(function () {
      parseQueryPage(response);
    }).toThrow("query 結果にページ以外が含まれています: partial");
  });
});
