import type { Temporal } from "temporal-polyfill";

import type { Dependencies } from "../config";
import type { DailyMaintenanceResult } from "./maintain-dailies";
import type { HabitMaintenanceResult } from "./maintain-habits";

import { maintainDailies } from "./maintain-dailies";
import { maintainHabits } from "./maintain-habits";

export interface MaintenanceSummary {
  readonly daily: DailyMaintenanceResult;
  readonly habit: HabitMaintenanceResult;
}

// 1 回の実行で Daily → 習慣の順にそれぞれを最新状態にする。
// 各段階は冪等で、途中で失敗しても次回の実行が未完了分だけを処理する。
export async function runMaintenance(
  { diary, habits }: Dependencies,
  today: Temporal.PlainDate,
): Promise<MaintenanceSummary> {
  const daily = await maintainDailies(diary, await diary.listDailies(), today);
  const habit = await maintainHabits(habits, await habits.listHabits(), today);

  return { daily, habit };
}
