import type { MaintenanceSummary } from "./maintenance";

import { readEnv } from "./env";
import { runDailyMaintenance } from "./maintenance";

function formatSummary(summary: MaintenanceSummary): string {
  return [
    `Daily作成${summary.dailyCreated}件`,
    `Weekly作成${summary.weekliesCreated}件`,
    `Monthly作成${summary.monthliesCreated}件`,
    `週次転記${summary.daysTransferred}日（フォールバック${summary.transferFallbacks}日）`,
    `月次転記${summary.monthlyDaysTransferred}日（フォールバック${summary.monthlyTransferFallbacks}日）`,
    `Refs生成${summary.monthlyRefsGenerated}件`,
    `リネーム${summary.renames}件`,
    `ロック${summary.locks}件`,
  ].join(" / ");
}

async function main(): Promise<void> {
  const summary = await runDailyMaintenance(readEnv(), new Date());
  console.log(formatSummary(summary));

  const fallbackDates = [
    ...summary.transferFallbackDates,
    ...summary.monthlyTransferFallbackDates,
  ];

  if (fallbackDates.length > 0) {
    console.log(`転記フォールバック対象: ${[...new Set(fallbackDates)].join(", ")}`);
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error("Notion 日次・週次・月次ページの定期処理に失敗しました", error);
  process.exitCode = 1;
}
