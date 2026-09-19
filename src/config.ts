import "dotenv/config";

import type { WebPageTitleLookup } from "./application/web-page-title-lookup";
import type { DiaryRepository } from "./domain/diary-repository";

import { Client } from "@notionhq/client";

import { createNotionDiaryRepository } from "./infrastructure/notion/diary-repository";
import { createWebPageTitleLookup } from "./infrastructure/web/page-title-lookup";

const NOTION_VERSION = "2026-03-11";

// ユースケースが必要とする外部依存の束。実装は infrastructure が提供し、ここで組み立てる。
export interface Dependencies {
  readonly diary: DiaryRepository;
  readonly pageTitles: WebPageTitleLookup;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`環境変数 ${name} が未設定です`);
  }

  return value;
}

export function loadDependencies(): Dependencies {
  const client = new Client({
    auth: getRequiredEnv("NOTION_TOKEN"),
    notionVersion: NOTION_VERSION,
  });

  return {
    diary: createNotionDiaryRepository(client, {
      dataSourceId: getRequiredEnv("NOTION_DATA_SOURCE_ID"),
      templates: {
        daily: getRequiredEnv("NOTION_TEMPLATE_ID"),
        weekly: getRequiredEnv("NOTION_WEEKLY_TEMPLATE_ID"),
        monthly: getRequiredEnv("NOTION_MONTHLY_TEMPLATE_ID"),
      },
    }),
    pageTitles: createWebPageTitleLookup(),
  };
}
