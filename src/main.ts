import type { MaintenanceSummary } from "./application/run-maintenance";

import { Temporal } from "temporal-polyfill";

import { loadDependencies } from "./config";
import { toJstDate } from "./domain/jst";
import { runMaintenance } from "./application/run-maintenance";

function formatSummary({ daily, habit }: MaintenanceSummary): string {
  return [
    `Daily: 作成${daily.created} / リネーム${daily.renames} / ロック${daily.locks}`,
    `習慣: 作成${habit.created}`,
  ].join("\n");
}

async function main(): Promise<void> {
  // 「今日」は JST の暦日として実行開始時に 1 回だけ決め、以降の判断はすべてこの日付を基準にする。
  const summary = await runMaintenance(loadDependencies(), toJstDate(Temporal.Now.instant()));
  console.log(formatSummary(summary));
}

try {
  await main();
} catch (error: unknown) {
  console.error("Notion 日誌・習慣ページの定期処理に失敗しました", error);
  process.exitCode = 1;
}
