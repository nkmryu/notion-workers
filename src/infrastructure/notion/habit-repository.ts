import type { Client } from "@notionhq/client";

import type { HabitRepository } from "../../domain/habit-repository";

import { collectAllDataSourceRows, isFullDataSource } from "@notionhq/client";

import { lazy } from "../../shared/lazy";
import { WRITE_INTERVAL_MS, sleep } from "./pacing";
import { createTitleProperty, parseDataSourceTitleKey, toHabitPage } from "./page-mapping";

export interface NotionHabitLocation {
  readonly dataSourceId: string;
}

export function createNotionHabitRepository(
  client: Client,
  { dataSourceId }: NotionHabitLocation,
): HabitRepository {
  // タイトルプロパティ名は data source ごとに固定なので、1 実行で 1 回だけ取得する。
  const getTitleKey = lazy(async function () {
    const dataSource = await client.dataSources.retrieve({ data_source_id: dataSourceId });

    if (!isFullDataSource(dataSource)) {
      throw new Error("習慣の data source の詳細を取得できません");
    }

    return parseDataSourceTitleKey(dataSource);
  });

  return {
    // 習慣データベースには種別の列が無いので、全行を取って日付の判定はドメインに任せる。
    async listHabits() {
      const rows = await collectAllDataSourceRows(client, {
        data_source_id: dataSourceId,
        result_type: "page",
      });

      return rows.map(toHabitPage);
    },

    // 習慣データベースにはテンプレートが無いので、タイトルだけの空のページを作る。
    // 起床時刻などのプロパティは、あとから人が記入する。
    async createHabit(title) {
      const page = await client.pages.create({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: { [await getTitleKey()]: createTitleProperty(title) },
      });
      await sleep(WRITE_INTERVAL_MS);

      return page.id;
    },
  };
}
