import type { Temporal } from "temporal-polyfill";

import type { Dependencies } from "../config";
import type { DailyMaintenanceResult } from "./maintain-dailies";
import type { HabitMaintenanceResult } from "./maintain-habits";
import type { DigestResult } from "./write-digests";

import { maintainDailies } from "./maintain-dailies";
import { maintainHabits } from "./maintain-habits";
import { writeDigests } from "./write-digests";

export interface MaintenanceSummary {
  readonly daily: DailyMaintenanceResult;
  readonly habit: HabitMaintenanceResult;
  readonly digest: DigestResult;
}

// 1 回の実行で Daily → 習慣 → まとめの順にそれぞれを最新状態にする。
// 各段階は冪等で、途中で失敗しても次回の実行が未完了分だけを処理する。
export async function runMaintenance(
  { diary, habits, pageTitles }: Dependencies,
  today: Temporal.PlainDate,
): Promise<MaintenanceSummary> {
  const { result: daily, dailies } = await maintainDailies(diary, await diary.listDailies(), today);

  // 習慣: 今日の分の作成だけ。件数の多いまとめより前に置き、まとめが失敗した日も今日のページを作る。
  const habit = await maintainHabits(habits, await habits.listHabits(), today);

  // まとめ: 終わった週・月の Daily を締めの日の Daily へ転記し、月は Refs も書いてからロックする。
  const digest = await writeDigests(diary, pageTitles, dailies, today);

  return { daily, habit, digest };
}
