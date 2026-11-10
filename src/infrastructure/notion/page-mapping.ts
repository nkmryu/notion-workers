import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  QueryDataSourceResponse,
} from "@notionhq/client";

import { isFullPage } from "@notionhq/client";

import { DailyPage } from "../../domain/daily";
import { HabitPage } from "../../domain/habit";

// 種別は type select で表され、Notion 上の選択肢名と厳密に一致させる。
export const PAGE_TYPE_PROPERTY_NAME = "type";
export const DAILY_TYPE_SELECT_NAME = "📝 Daily";

type Row = QueryDataSourceResponse["results"][number];
type PageProperties = PageObjectResponse["properties"];
type DataSourceProperties = DataSourceObjectResponse["properties"];

function findTitlePropertyKey(
  properties: PageProperties | DataSourceProperties,
  owner: "ページ" | "data source",
): string {
  const titleEntry = Object.entries(properties).find(function ([, property]) {
    return property.type === "title";
  });

  if (titleEntry === undefined) {
    throw new Error(`${owner} に title 型のプロパティがありません`);
  }

  return titleEntry[0];
}

function parseTitle(properties: PageProperties): string {
  const property = properties[findTitlePropertyKey(properties, "ページ")];

  if (property === undefined || property.type !== "title") {
    throw new Error("タイトルプロパティの形式が不正です");
  }

  return property.title
    .map(function (item) {
      return item.plain_text;
    })
    .join("");
}

function requireFullPage(row: Row): PageObjectResponse {
  if (!isFullPage(row)) {
    throw new Error(`query 結果にページ以外が含まれています: ${row.id}`);
  }

  return row;
}

// ページ作成・リネームで送るタイトルの値。parseTitle の逆向きの写像。
export function createTitleProperty(title: string): {
  readonly title: [{ readonly type: "text"; readonly text: { readonly content: string } }];
} {
  return { title: [{ type: "text", text: { content: title } }] };
}

export function parseDataSourceTitleKey(dataSource: DataSourceObjectResponse): string {
  return findTitlePropertyKey(dataSource.properties, "data source");
}

export function toDailyPage(row: Row): DailyPage {
  const page = requireFullPage(row);
  const title = parseTitle(page.properties);

  return DailyPage.fromRecord({
    id: page.id,
    createdTime: page.created_time,
    title,
    isLocked: page.is_locked,
  });
}

export function toHabitPage(row: Row): HabitPage {
  const page = requireFullPage(row);

  return HabitPage.fromRecord({ id: page.id, title: parseTitle(page.properties) });
}
