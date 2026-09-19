import type { MaintenanceSummary } from "./maintenance/run";

import { loadConfig } from "./config";
import { runMaintenance } from "./maintenance/run";

function formatSummary(summary: MaintenanceSummary): string {
  return [
    `Daily作成${summary.dailyCreated}件`,
    `Weekly作成${summary.weekliesCreated}件`,
    `Monthly作成${summary.monthliesCreated}件`,
    `週次転記${summary.weeklyDaysTransferred}日（フォールバック${summary.weeklyFallbackDates.length}日）`,
    `月次転記${summary.monthlyDaysTransferred}日（フォールバック${summary.monthlyFallbackDates.length}日）`,
    `Refs生成${summary.refsGenerated}件`,
    `リネーム${summary.renames}件`,
    `ロック${summary.locks}件`,
  ].join(" / ");
}

async function main(): Promise<void> {
  const summary = await runMaintenance(loadConfig(), new Date());
  console.log(formatSummary(summary));

  const fallbackDates = new Set([
    ...summary.weeklyFallbackDates,
    ...summary.monthlyFallbackDates,
  ]);

  if (fallbackDates.size > 0) {
    console.log(`転記フォールバック対象: ${[...fallbackDates].join(", ")}`);
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error("Notion 日次・週次・月次ページの定期処理に失敗しました", error);
  process.exitCode = 1;
}
