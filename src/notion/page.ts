import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  QueryDataSourceResponse,
} from "@notionhq/client";

import type { NotionPage, PeriodType } from "../diary/page";

import { isFullPage } from "@notionhq/client";

import { PERIOD_TYPE } from "../diary/page";

const PAGE_TYPE_PROPERTY_NAME = "type";
// 表記ゆれを許すと DB 側の意図しない選択肢へ誤マッチするため、小文字へ正規化せず Notion の select 選択肢と厳密に一致させる。
const PERIOD_TYPE_BY_SELECT_NAME: Readonly<Record<string, PeriodType>> = {
  Weekly: PERIOD_TYPE.weekly,
  Monthly: PERIOD_TYPE.monthly,
};

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

function parsePeriodType(properties: PageProperties): PeriodType | null {
  const typeProperty = properties[PAGE_TYPE_PROPERTY_NAME];

  if (typeProperty === undefined || typeProperty.type !== "select") {
    return null;
  }

  const selectName = typeProperty.select?.name;
  return selectName === undefined
    ? null
    : (PERIOD_TYPE_BY_SELECT_NAME[selectName] ?? null);
}

export function parsePage(page: PageObjectResponse): NotionPage {
  return {
    id: page.id,
    createdTime: page.created_time,
    title: parseTitle(page.properties),
    isLocked: page.is_locked,
    periodType: parsePeriodType(page.properties),
  };
}

export function parseDataSourceTitleKey(
  dataSource: DataSourceObjectResponse,
): string {
  return findTitlePropertyKey(dataSource.properties, "data source");
}

export function parseNotionPage(
  row: QueryDataSourceResponse["results"][number],
): NotionPage {
  if (!isFullPage(row)) {
    throw new Error(`query 結果にページ以外が含まれています: ${row.id}`);
  }

  return parsePage(row);
}
