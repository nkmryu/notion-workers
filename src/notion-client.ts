import type { Client } from "@notionhq/client";

import type { NotionPage } from "./notion-response";

import { isFullBlock, isFullDataSource } from "@notionhq/client";

import {
  parseDataSourceTitleKey,
  parseQueryPage,
} from "./notion-response";

export interface CreatePageFromTemplateInput {
  readonly notion: Client;
  readonly dataSourceId: string;
  readonly templateId: string;
  readonly titleKey: string;
  readonly title: string;
}

function createTitleProperty(title: string): {
  readonly title: [{ readonly type: "text"; readonly text: { readonly content: string } }];
} {
  return {
    title: [{ type: "text", text: { content: title } }],
  };
}

export async function getAllPages(
  notion: Client,
  dataSourceId: string,
): Promise<readonly NotionPage[]> {
  let pageChunks: readonly (readonly NotionPage[])[] = [];
  let cursor: string | null = null;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      result_type: "page",
      ...(cursor === null ? {} : { start_cursor: cursor }),
    });
    const queryPage = parseQueryPage(response);
    pageChunks = [...pageChunks, queryPage.pages];
    cursor = queryPage.hasMore ? queryPage.nextCursor : null;
  } while (cursor !== null);

  return pageChunks.flat();
}

export async function getDataSourceTitleKey(
  notion: Client,
  dataSourceId: string,
): Promise<string> {
  const dataSource = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  });

  if (!isFullDataSource(dataSource)) {
    throw new Error("data source の詳細を取得できません");
  }

  return parseDataSourceTitleKey(dataSource);
}

export async function createPageFromTemplate(
  input: CreatePageFromTemplateInput,
): Promise<string> {
  const page = await input.notion.pages.create({
    parent: { type: "data_source_id", data_source_id: input.dataSourceId },
    properties: {
      [input.titleKey]: createTitleProperty(input.title),
    },
    template: {
      type: "template_id",
      template_id: input.templateId,
      timezone: "Asia/Tokyo",
    },
  });

  return page.id;
}

export async function getPageMarkdown(
  notion: Client,
  pageId: string,
): Promise<string> {
  const response = await notion.pages.retrieveMarkdown({ page_id: pageId });

  return response.markdown;
}

export async function getBlockUrl(
  notion: Client,
  blockId: string,
): Promise<string | null> {
  const block = await notion.blocks.retrieve({ block_id: blockId });

  if (!isFullBlock(block)) {
    return null;
  }

  // bookmark・embed・link_preview は共通して { url } を持つ。それ以外の型は補完対象にしない。
  const data: unknown = block[block.type as keyof typeof block];
  const url =
    typeof data === "object" && data !== null && "url" in data
      ? data.url
      : null;

  return typeof url === "string" && url !== "" ? url : null;
}

export async function appendMarkdown(
  notion: Client,
  pageId: string,
  content: string,
): Promise<void> {
  await notion.pages.updateMarkdown({
    page_id: pageId,
    type: "insert_content",
    insert_content: { content, position: { type: "end" } },
  });
}

export async function renamePage(
  notion: Client,
  pageId: string,
  titleKey: string,
  title: string,
): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [titleKey]: createTitleProperty(title),
    },
  });
}

export async function lockPage(notion: Client, pageId: string): Promise<void> {
  await notion.pages.update({ page_id: pageId, is_locked: true });
}
