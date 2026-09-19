import type { Client } from "@notionhq/client";

import { ContentRejectedError } from "../../domain/diary-repository";
import type { DiaryRepository } from "../../domain/diary-repository";

import {
  collectAllDataSourceRows,
  isFullBlock,
  isFullDataSource,
} from "@notionhq/client";

import { JST_TIME_ZONE } from "../../domain/jst";
import { extractSectionTitles } from "../../domain/markdown-section";
import { isNotionValidationError } from "./error";
import { lazy } from "../../shared/lazy";
import { mapSequentially } from "../../shared/sequence";
import { extractBlockLinkIds, restoreBlockLinks } from "./markdown-links";
import { READ_INTERVAL_MS, WRITE_INTERVAL_MS, sleep } from "./pacing";
import { monthly } from "../../domain/monthly";
import { weekly } from "../../domain/weekly";
import {
  PAGE_TYPE_PROPERTY_NAME,
  PAGE_TYPE_SELECT_NAME,
  parseDataSourceTitleKey,
  toDailyPage,
  toPeriodPage,
} from "./page-mapping";

function createTitleProperty(title: string): {
  readonly title: [{ readonly type: "text"; readonly text: { readonly content: string } }];
} {
  return { title: [{ type: "text", text: { content: title } }] };
}

// Notion API の平均 3 req/s 制限に合わせ、各操作の後に待機する。429 と 5xx の再試行は SDK が行う。
export function createNotionDiaryRepository(
  client: Client,
  dataSourceId: string,
): DiaryRepository {
  // タイトルプロパティ名は data source ごとに固定なので、1 実行で 1 回だけ取得する。
  const getTitleKey = lazy(async function () {
    const dataSource = await client.dataSources.retrieve({ data_source_id: dataSourceId });

    if (!isFullDataSource(dataSource)) {
      throw new Error("data source の詳細を取得できません");
    }

    return parseDataSourceTitleKey(dataSource);
  });

  // 単純なページネーションは 1 クエリ 10,000 行の上限で黙って打ち切られるため、SDK の全件取得を使う。
  function listRowsOfType(selectName: string) {
    return collectAllDataSourceRows(client, {
      data_source_id: dataSourceId,
      result_type: "page",
      filter: {
        property: PAGE_TYPE_PROPERTY_NAME,
        select: { equals: selectName },
      },
    });
  }

  // 外部 URL を持つのは bookmark・embed・link_preview の 3 種。それ以外の型は補完対象にしない。
  async function getBlockUrl(blockId: string): Promise<string | null> {
    const block = await client.blocks.retrieve({ block_id: blockId });

    if (!isFullBlock(block)) {
      return null;
    }

    switch (block.type) {
      case "bookmark":
        return block.bookmark.url || null;
      case "embed":
        return block.embed.url || null;
      case "link_preview":
        return block.link_preview.url || null;
      default:
        return null;
    }
  }

  return {
    async listDailies() {
      const rows = await listRowsOfType(PAGE_TYPE_SELECT_NAME.daily);
      return rows.map(toDailyPage);
    },

    async listWeeklies() {
      const rows = await listRowsOfType(PAGE_TYPE_SELECT_NAME.weekly);
      return rows.map(function (row) {
        return toPeriodPage(weekly, row);
      });
    },

    async listMonthlies() {
      const rows = await listRowsOfType(PAGE_TYPE_SELECT_NAME.monthly);
      return rows.map(function (row) {
        return toPeriodPage(monthly, row);
      });
    },

    async createPageFromTemplate({ templateId, title }) {
      const page = await client.pages.create({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: { [await getTitleKey()]: createTitleProperty(title) },
        template: {
          type: "template_id",
          template_id: templateId,
          timezone: JST_TIME_ZONE,
        },
      });
      await sleep(WRITE_INTERVAL_MS);

      return page.id;
    },

    async renamePage(pageId, title) {
      await client.pages.update({
        page_id: pageId,
        properties: { [await getTitleKey()]: createTitleProperty(title) },
      });
      await sleep(WRITE_INTERVAL_MS);
    },

    async lockPage(pageId) {
      await client.pages.update({ page_id: pageId, is_locked: true });
      await sleep(WRITE_INTERVAL_MS);
    },

    async getSectionTitles(pageId) {
      const response = await client.pages.retrieveMarkdown({ page_id: pageId });
      await sleep(READ_INTERVAL_MS);

      return extractSectionTitles(response.markdown);
    },

    async getPageMarkdown(pageId) {
      const response = await client.pages.retrieveMarkdown({ page_id: pageId });
      await sleep(READ_INTERVAL_MS);
      const blockUrls = await mapSequentially(
        extractBlockLinkIds(response.markdown),
        async function (blockId): Promise<readonly [string, string | null]> {
          const url = await getBlockUrl(blockId);
          await sleep(READ_INTERVAL_MS);
          return [blockId, url];
        },
      );

      return restoreBlockLinks(
        response.markdown,
        new Map(
          blockUrls.flatMap(function ([blockId, url]) {
            return url === null ? [] : [[blockId, url] as const];
          }),
        ),
      );
    },

    async appendMarkdown(pageId, content) {
      try {
        await client.pages.updateMarkdown({
          page_id: pageId,
          type: "insert_content",
          insert_content: { content, position: { type: "end" } },
        });
      } catch (error: unknown) {
        // 書式検証エラーだけをポートの契約へ変換する。認証・レート制限・通信障害はそのまま上げる。
        if (isNotionValidationError(error)) {
          throw new ContentRejectedError(pageId, error);
        }

        throw error;
      } finally {
        await sleep(WRITE_INTERVAL_MS);
      }
    },

  };
}
