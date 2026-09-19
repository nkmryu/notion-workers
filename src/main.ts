import type { MaintenanceSummary } from "./application/run-maintenance";

import { Temporal } from "temporal-polyfill";

import { loadDependencies } from "./config";
import { formatDailyTitle } from "./domain/daily";
import { toJstDate } from "./domain/jst";
import { runMaintenance } from "./application/run-maintenance";

function formatSummary({ daily, weekly, monthly }: MaintenanceSummary): string {
  return [
    `Daily: 作成${daily.created} / リネーム${daily.renames} / ロック${daily.locks}`,
    `Weekly: 作成${weekly.created} / 転記${weekly.daysTransferred}日（省略${weekly.fallbackDates.length}） / リネーム${weekly.renames} / ロック${weekly.locks}`,
    `Monthly: 作成${monthly.created} / 転記${monthly.daysTransferred}日（省略${monthly.fallbackDates.length}） / Refs${monthly.refs.generated} / リネーム${monthly.renames} / ロック${monthly.locks}`,
  ].join("\n");
}

async function main(): Promise<void> {
  // 「今日」は JST の暦日として実行開始時に 1 回だけ決め、以降の判断はすべてこの日付を基準にする。
  const summary = await runMaintenance(loadDependencies(), toJstDate(Temporal.Now.instant()));
  console.log(formatSummary(summary));

  const fallbackHeadings = new Set(
    [...summary.weekly.fallbackDates, ...summary.monthly.fallbackDates].map(formatDailyTitle),
  );

  if (fallbackHeadings.size > 0) {
    console.log(`転記を省略した日（元ページを参照）: ${[...fallbackHeadings].join(", ")}`);
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error("Notion 日次・週次・月次ページの定期処理に失敗しました", error);
  process.exitCode = 1;
}
