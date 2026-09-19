import type { MaintenanceSummary } from "./maintenance/run";

import { loadConfig } from "./config";
import { runMaintenance } from "./maintenance/run";

function formatSummary({ daily, weekly, monthly }: MaintenanceSummary): string {
  return [
    `Daily: 作成${daily.created} / リネーム${daily.renames} / ロック${daily.locks}`,
    `Weekly: 作成${weekly.created} / 転記${weekly.daysTransferred}日（省略${weekly.fallbackDates.length}） / リネーム${weekly.renames} / ロック${weekly.locks}`,
    `Monthly: 作成${monthly.created} / 転記${monthly.daysTransferred}日（省略${monthly.fallbackDates.length}） / Refs${monthly.finalized.generated} / リネーム${monthly.renames} / ロック${monthly.locks}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const summary = await runMaintenance(loadConfig(), new Date());
  console.log(formatSummary(summary));

  const fallbackDates = new Set([
    ...summary.weekly.fallbackDates,
    ...summary.monthly.fallbackDates,
  ]);

  if (fallbackDates.size > 0) {
    console.log(`転記を省略した日（元ページを参照）: ${[...fallbackDates].join(", ")}`);
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error("Notion 日次・週次・月次ページの定期処理に失敗しました", error);
  process.exitCode = 1;
}
