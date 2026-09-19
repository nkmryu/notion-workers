import "dotenv/config";

import { Client } from "@notionhq/client";

import type { Env } from "./maintenance";

const NOTION_VERSION = "2026-03-11";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`環境変数 ${name} が未設定です`);
  }

  return value;
}

export function readEnv(): Env {
  return {
    notion: new Client({
      auth: getRequiredEnv("NOTION_TOKEN"),
      notionVersion: NOTION_VERSION,
    }),
    dataSourceId: getRequiredEnv("NOTION_DATA_SOURCE_ID"),
    templateId: getRequiredEnv("NOTION_TEMPLATE_ID"),
    weeklyTemplateId: getRequiredEnv("NOTION_WEEKLY_TEMPLATE_ID"),
    monthlyTemplateId: getRequiredEnv("NOTION_MONTHLY_TEMPLATE_ID"),
  };
}
