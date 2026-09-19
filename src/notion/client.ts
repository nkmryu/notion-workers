import type { Client } from "@notionhq/client";

import type { DiaryPage } from "../diary/page";

import { isFullBlock, isFullDataSource } from "@notionhq/client";

import { parseDataSourceTitleKey, parseQueryPage } from "./page";

// メンテナンス処理が日誌データベースに対して必要とする操作。SDK の Client はこの背後に閉じ込める。
export interface NotionDiary {
  readonly listPages: () => Promise<readonly DiaryPage[]>;
  readonly getTitleKey: () => Promise<string>;
  readonly createPageFromTemplate: (input: {
    readonly templateId: string;
    readonly titleKey: string;
    readonly title: string;
  }) => Promise<string>;
  readonly renamePage: (
    pageId: string,
    titleKey: string,
    title: string,
  ) => Promise<void>;
  readonly lockPage: (pageId: string) => Promise<void>;
  readonly getPageMarkdown: (pageId: string) => Promise<string>;
  readonly appendMarkdown: (pageId: string, content: string) => Promise<void>;
  readonly getBlockUrl: (blockId: string) => Promise<string | null>;
}

function createTitleProperty(title: string): {
  readonly title: [{ readonly type: "text"; readonly text: { readonly content: string } }];
} {
  return { title: [{ type: "text", text: { content: title } }] };
}

export function createNotionDiary(
  client: Client,
  dataSourceId: string,
): NotionDiary {
  return {
    async listPages() {
      let pageChunks: readonly (readonly DiaryPage[])[] = [];
      let cursor: string | null = null;

      do {
        const response = await client.dataSources.query({
          data_source_id: dataSourceId,
          result_type: "page",
          ...(cursor === null ? {} : { start_cursor: cursor }),
        });
        const queryPage = parseQueryPage(response);
        pageChunks = [...pageChunks, queryPage.pages];
        cursor = queryPage.hasMore ? queryPage.nextCursor : null;
      } while (cursor !== null);

      return pageChunks.flat();
    },

    async getTitleKey() {
      const dataSource = await client.dataSources.retrieve({
        data_source_id: dataSourceId,
      });

      if (!isFullDataSource(dataSource)) {
        throw new Error("data source の詳細を取得できません");
      }

      return parseDataSourceTitleKey(dataSource);
    },

    async createPageFromTemplate({ templateId, titleKey, title }) {
      const page = await client.pages.create({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: { [titleKey]: createTitleProperty(title) },
        template: {
          type: "template_id",
          template_id: templateId,
          timezone: "Asia/Tokyo",
        },
      });

      return page.id;
    },

    async renamePage(pageId, titleKey, title) {
      await client.pages.update({
        page_id: pageId,
        properties: { [titleKey]: createTitleProperty(title) },
      });
    },

    async lockPage(pageId) {
      await client.pages.update({ page_id: pageId, is_locked: true });
    },

    async getPageMarkdown(pageId) {
      const response = await client.pages.retrieveMarkdown({ page_id: pageId });
      return response.markdown;
    },

    async appendMarkdown(pageId, content) {
      await client.pages.updateMarkdown({
        page_id: pageId,
        type: "insert_content",
        insert_content: { content, position: { type: "end" } },
      });
    },

    async getBlockUrl(blockId) {
      const block = await client.blocks.retrieve({ block_id: blockId });

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
    },
  };
}
