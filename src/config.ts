import "dotenv/config";

import type { DiaryRepository } from "./domain/diary-repository";
import type { HabitRepository } from "./domain/habit-repository";

import { Client } from "@notionhq/client";

import { createNotionDiaryRepository } from "./infrastructure/notion/diary-repository";
import { createNotionHabitRepository } from "./infrastructure/notion/habit-repository";

const NOTION_VERSION = "2026-03-11";

// ユースケースが必要とする外部依存の束。実装は infrastructure が提供し、ここで組み立てる。
export interface Dependencies {
  readonly diary: DiaryRepository;
  readonly habits: HabitRepository;
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
      dailyTemplateId: getRequiredEnv("NOTION_TEMPLATE_ID"),
    }),
    habits: createNotionHabitRepository(client, {
      dataSourceId: getRequiredEnv("NOTION_HABIT_DATA_SOURCE_ID"),
    }),
  };
}
