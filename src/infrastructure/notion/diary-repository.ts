import type { Client } from "@notionhq/client";

import type { DiaryRepository } from "../../domain/diary-repository";

import { collectAllDataSourceRows, isFullDataSource } from "@notionhq/client";

import { JST_TIME_ZONE } from "../../domain/jst";
import { lazy } from "../../shared/lazy";
import { WRITE_INTERVAL_MS, sleep } from "./pacing";
import {
  DAILY_DATE_PROPERTY_NAME,
  DAILY_TYPE_SELECT_NAME,
  PAGE_TYPE_PROPERTY_NAME,
  createDateProperty,
  createTitleProperty,
  parseDataSourceTitleKey,
  toDailyPage,
} from "./page-mapping";

// Notion API の平均 3 req/s 制限に合わせ、書き込みの後に待機する。429 と 5xx の再試行は SDK が行う。
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
  };
}
