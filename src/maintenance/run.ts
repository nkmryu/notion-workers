import type { Config } from "../config";
import type { DailyMaintenanceResult } from "./daily";
import type { PeriodMaintenanceResult } from "./period";
import type { RefsResult } from "./refs";

import { monthly } from "../diary/monthly";
import { weekly } from "../diary/weekly";
import { maintainDailies } from "./daily";
import { maintainPeriod } from "./period";
import { generateRefs } from "./refs";

export interface MaintenanceSummary {
  readonly daily: DailyMaintenanceResult;
  readonly weekly: PeriodMaintenanceResult<void>;
  readonly monthly: PeriodMaintenanceResult<RefsResult>;
}

// 1 回の実行で Daily → Weekly → Monthly の順にそれぞれを最新状態にする。
// 各段階は冪等で、途中で失敗しても次回の実行が未完了分だけを処理する。
export async function runMaintenance(
  config: Config,
  now: Date,
): Promise<MaintenanceSummary> {
  const { diary } = config;
  const dailies = await diary.listDailies();

  return {
    daily: await maintainDailies(diary, config.dailyTemplateId, dailies, now),
    weekly: await maintainPeriod(
      diary,
      { period: weekly, templateId: config.weeklyTemplateId, async beforeLock() {} },
      dailies,
      await diary.listWeeklies(),
      now,
    ),
    monthly: await maintainPeriod(
      diary,
      {
        period: monthly,
        templateId: config.monthlyTemplateId,
        // 閉じる前に、その月の外部 URL を Refs としてまとめる。
        beforeLock(input) {
          return generateRefs(diary, input.archives, input.dailies, input.now);
        },
      },
      dailies,
      await diary.listMonthlies(),
      now,
    ),
  };
}
