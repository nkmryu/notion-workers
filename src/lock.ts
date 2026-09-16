import "dotenv/config";
import { Client, isFullPage } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN!,
  notionVersion: "2026-03-11",
});

const dataSourceId = process.env.NOTION_DATA_SOURCE_ID!;
const lockAfterDays = Number(process.env.LOCK_AFTER_DAYS ?? "30");
const dryRun = process.env.DRY_RUN === "true";

const cutoff = new Date(
  Date.now() - lockAfterDays * 24 * 60 * 60 * 1000,
).toISOString();

let cursor: string | undefined;

do {
  const response = await notion.dataSources.query({
    data_source_id: dataSourceId,

    filter: {
      timestamp: "created_time",
      created_time: {
        before: cutoff,
      },
    },

    result_type: "page",
    page_size: 100,
    start_cursor: cursor,
  });

  for (const result of response.results) {
    if (!isFullPage(result)) {
      continue;
    }

    // すでに目的の状態
    if (result.is_locked) {
      continue;
    }

    console.log(`[TARGET] ${result.url}`);

    if (dryRun) {
      continue;
    }

    await notion.pages.update({
      page_id: result.id,
      is_locked: true,
    });

    console.log(`[LOCKED] ${result.url}`);
  }

  cursor = response.next_cursor ?? undefined;
} while (cursor);