import type { Client } from "@notionhq/client";

import { ContentRejectedError } from "../../domain/diary-repository";
import type { DiaryRepository } from "../../domain/diary-repository";

import { collectAllDataSourceRows, isFullBlock, isFullDataSource } from "@notionhq/client";

import { JST_TIME_ZONE } from "../../domain/jst";
import { extractDigestSectionTitles } from "../../domain/markdown-section";
import { lazy } from "../../shared/lazy";
import { mapSequentially } from "../../shared/sequence";
import { isNotionContentRejection } from "./error";
import { createPageMention, extractBlockLinkIds, normalizeMarkdown } from "./markdown-normalization";
import { READ_INTERVAL_MS, WRITE_INTERVAL_MS, sleep } from "./pacing";
import {
  DAILY_DATE_PROPERTY_NAME,
  DAILY_TYPE_SELECT_NAME,
  PAGE_TYPE_PROPERTY_NAME,
  createDateProperty,
  createTitleProperty,
  parseDataSourceTitleKey,
  toDailyPage,
} from "./page-mapping";

// Notion API の平均 3 req/s 制限に合わせ、各操作の後に待機する。429 と 5xx の再試行は SDK が行う。
export interface NotionDiaryLocation {
  readonly dataSourceId: string;
  // 日次テンプレート。type select はテンプレートが付ける。
  readonly dailyTemplateId: string;
}

export function createNotionDiaryRepository(
  client: Client,
  { dataSourceId, dailyTemplateId }: NotionDiaryLocation,
): DiaryRepository {
  // タイトルプロパティ名は data source ごとに固定なので、1 実行で 1 回だけ取得する。
  const getTitleKey = lazy(async function () {
    const dataSource = await client.dataSources.retrieve({ data_source_id: dataSourceId });

    if (!isFullDataSource(dataSource)) {
      throw new Error("data source の詳細を取得できません");
    }

    return parseDataSourceTitleKey(dataSource);
  });

  async function retrieveMarkdown(pageId: string): Promise<string> {
    const response = await client.pages.retrieveMarkdown({ page_id: pageId });
    await sleep(READ_INTERVAL_MS);

    return response.markdown;
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
    // 単純なページネーションは 1 クエリ 10,000 行の上限で黙って打ち切られるため、SDK の全件取得を使う。
    async listDailies() {
      const rows = await collectAllDataSourceRows(client, {
        data_source_id: dataSourceId,
        result_type: "page",
        filter: {
          property: PAGE_TYPE_PROPERTY_NAME,
          select: { equals: DAILY_TYPE_SELECT_NAME },
        },
      });

      return rows.map(toDailyPage);
    },

    // date はテンプレートの「今日」に任せず、タイトルと同じ日付をここで書く。
    // テンプレートの設定は API から読めず、カレンダーの日がずれても気づけないため。
    // テンプレートは作成後に非同期で適用されるが、リクエストで渡した date は上書きされない（2026-11-10 に実測）。
    async createDaily({ title, date }) {
      const page = await client.pages.create({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: {
          [await getTitleKey()]: createTitleProperty(title),
          [DAILY_DATE_PROPERTY_NAME]: createDateProperty(date),
        },
        template: {
          type: "template_id",
          template_id: dailyTemplateId,
          timezone: JST_TIME_ZONE,
        },
      });
      await sleep(WRITE_INTERVAL_MS);

      return toDailyPage(page);
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

    async getDigestSectionTitles(pageId, label) {
      return extractDigestSectionTitles(await retrieveMarkdown(pageId), label);
    },

    async getPageMarkdown(pageId) {
      const markdown = await retrieveMarkdown(pageId);
      const blockUrls = await mapSequentially(
        extractBlockLinkIds(markdown),
        async function (blockId): Promise<readonly [string, string | null]> {
          const url = await getBlockUrl(blockId);
          await sleep(READ_INTERVAL_MS);
          return [blockId, url];
        },
      );

      return normalizeMarkdown(
        markdown,
        pageId,
        new Map(
          blockUrls.flatMap(function ([blockId, url]) {
            return url === null ? [] : [[blockId, url] as const];
          }),
        ),
      );
    },

    mentionOf: createPageMention,

    async appendMarkdown(pageId, content) {
      try {
        await client.pages.updateMarkdown({
          page_id: pageId,
          type: "insert_content",
          insert_content: { content, position: { type: "end" } },
        });
      } catch (error: unknown) {
        // 本文を理由にした拒否だけをポートの契約へ変換する。認証・レート制限・通信障害はそのまま上げる。
        if (isNotionContentRejection(error)) {
          throw new ContentRejectedError(pageId, error);
        }

        throw error;
      } finally {
        await sleep(WRITE_INTERVAL_MS);
      }
    },
  };
}
