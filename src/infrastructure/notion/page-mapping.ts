import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  QueryDataSourceResponse,
} from "@notionhq/client";

import type { PeriodDefinition } from "../../domain/period";

import { isFullPage } from "@notionhq/client";

import { DailyPage } from "../../domain/daily";
import { PERIOD_TYPE } from "../../domain/page";
import { PeriodPage } from "../../domain/period";

// 種別は type select で表され、Notion 上の選択肢名と厳密に一致させる。
export const PAGE_TYPE_PROPERTY_NAME = "type";
export const PAGE_TYPE_SELECT_NAME = {
  daily: "📝 Daily",
  [PERIOD_TYPE.weekly]: "Weekly",
  [PERIOD_TYPE.monthly]: "Monthly",
} as const;

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

export function toPeriodPage<K>(period: PeriodDefinition<K>, row: Row): PeriodPage<K> {
  const page = requireFullPage(row);
  const title = parseTitle(page.properties);

  return PeriodPage.fromRecord(period, {
    id: page.id,
    createdTime: page.created_time,
    title,
    isLocked: page.is_locked,
  });
}
