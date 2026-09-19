import "dotenv/config";

import type { DiaryStore } from "./maintenance/diary-store";
import type { PageTitleSource } from "./maintenance/page-title-source";

import { Client } from "@notionhq/client";

import { createNotionDiaryStore } from "./notion/client";
import { createWebPageTitleSource } from "./web/page-title-lookup";

const NOTION_VERSION = "2026-03-11";

export interface Config {
  readonly diary: DiaryStore;
  readonly pageTitles: PageTitleSource;
  readonly dailyTemplateId: string;
  readonly weeklyTemplateId: string;
  readonly monthlyTemplateId: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`環境変数 ${name} が未設定です`);
  }

  return value;
}

export function loadConfig(): Config {
  const client = new Client({
    auth: getRequiredEnv("NOTION_TOKEN"),
    notionVersion: NOTION_VERSION,
  });

  return {
    diary: createNotionDiaryStore(client, getRequiredEnv("NOTION_DATA_SOURCE_ID")),
    pageTitles: createWebPageTitleSource(),
    dailyTemplateId: getRequiredEnv("NOTION_TEMPLATE_ID"),
    weeklyTemplateId: getRequiredEnv("NOTION_WEEKLY_TEMPLATE_ID"),
    monthlyTemplateId: getRequiredEnv("NOTION_MONTHLY_TEMPLATE_ID"),
  };
}
