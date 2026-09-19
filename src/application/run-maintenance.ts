import type { Temporal } from "temporal-polyfill";

import type { Config } from "../config";
import type { DailyMaintenanceResult } from "./maintain-dailies";
import type { PeriodMaintenanceResult } from "./maintain-period";
import type { RefsResult } from "./generate-refs";

import { monthly } from "../domain/monthly";
import { weekly } from "../domain/weekly";
import { maintainDailies } from "./maintain-dailies";
import { maintainPeriod } from "./maintain-period";
import { generateRefs } from "./generate-refs";

export interface MaintenanceSummary {
  readonly daily: DailyMaintenanceResult;
  readonly weekly: PeriodMaintenanceResult<void>;
  readonly monthly: PeriodMaintenanceResult<RefsResult>;
}

// 1 回の実行で Daily → Weekly → Monthly の順にそれぞれを最新状態にする。
// 各段階は冪等で、途中で失敗しても次回の実行が未完了分だけを処理する。
export async function runMaintenance(
  config: Config,
  today: Temporal.PlainDate,
): Promise<MaintenanceSummary> {
  const { diary, pageTitles } = config;
  const dailies = await diary.listDailies();

  return {
    daily: await maintainDailies(diary, config.dailyTemplateId, dailies, today),
    weekly: await maintainPeriod(
      diary,
      { period: weekly, templateId: config.weeklyTemplateId, async beforeLock() {} },
      dailies,
      await diary.listWeeklies(),
      today,
    ),
    monthly: await maintainPeriod(
      diary,
      {
        period: monthly,
        templateId: config.monthlyTemplateId,
        // 閉じる前に、その月の外部 URL を Refs としてまとめる。
        beforeLock(input) {
          return generateRefs(diary, pageTitles, input.archives, input.dailies, input.today);
        },
      },
      dailies,
      await diary.listMonthlies(),
      today,
    ),
  };
}
