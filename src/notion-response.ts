import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  QueryDataSourceResponse,
} from "@notionhq/client";

import { isFullPage } from "@notionhq/client";

import {
  MONTHLY_PAGE_TYPE,
  PAGE_TYPE_PROPERTY_NAME,
  WEEKLY_PAGE_TYPE,
} from "./page-type";

export interface NotionPage {
  readonly id: string;
  readonly createdTime: string;
  readonly isLocked: boolean;
  readonly titleKey: string;
  readonly currentTitle: string;
  readonly isWeekly: boolean;
  readonly isMonthly: boolean;
}

export interface QueryPage {
  readonly pages: readonly NotionPage[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

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

function parseTitleProperty(properties: PageProperties): {
  readonly titleKey: string;
  readonly currentTitle: string;
} {
  const titleKey = findTitlePropertyKey(properties, "ページ");
  const property = properties[titleKey];

  if (property === undefined || property.type !== "title") {
    throw new Error(`タイトルプロパティ ${titleKey} の形式が不正です`);
  }

  const currentTitle = property.title
    .map(function (item) {
      return item.plain_text;
    })
    .join("");

  return { titleKey, currentTitle };
}

function getPageType(properties: PageProperties): string | null {
  const typeProperty = properties[PAGE_TYPE_PROPERTY_NAME];

  if (typeProperty === undefined || typeProperty.type !== "select") {
    return null;
  }

  return typeProperty.select?.name ?? null;
}

export function parsePage(page: PageObjectResponse): NotionPage {
  const pageType = getPageType(page.properties);

  return {
    id: page.id,
    createdTime: page.created_time,
    isLocked: page.is_locked,
    isWeekly: pageType === WEEKLY_PAGE_TYPE,
    isMonthly: pageType === MONTHLY_PAGE_TYPE,
    ...parseTitleProperty(page.properties),
  };
}

export function parseDataSourceTitleKey(
  dataSource: DataSourceObjectResponse,
): string {
  return findTitlePropertyKey(dataSource.properties, "data source");
}

export function parseQueryPage(response: QueryDataSourceResponse): QueryPage {
  if (response.has_more && response.next_cursor === null) {
    throw new Error("has_more が true ですが next_cursor がありません");
  }

  const pages = response.results.map(function (result) {
    if (!isFullPage(result)) {
      throw new Error(`query 結果にページ以外が含まれています: ${result.id}`);
    }

    return parsePage(result);
  });

  return {
    pages,
    hasMore: response.has_more,
    nextCursor: response.next_cursor,
  };
}
