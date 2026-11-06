import type { Temporal } from "temporal-polyfill";

import type { Dependencies } from "../config";
import type { DailyMaintenanceResult } from "./maintain-dailies";
import type { HabitMaintenanceResult } from "./maintain-habits";
import type { PeriodMaintenanceResult } from "./maintain-period";
import type { RefsResult } from "./generate-refs";

import { monthly } from "../domain/monthly";
import { weekly } from "../domain/weekly";
import { generateRefs } from "./generate-refs";
import { maintainDailies } from "./maintain-dailies";
import { maintainHabits } from "./maintain-habits";
import { preparePeriodPages, settlePeriodPages } from "./maintain-period";

export interface MaintenanceSummary {
  readonly daily: DailyMaintenanceResult;
  readonly habit: HabitMaintenanceResult;
  readonly weekly: PeriodMaintenanceResult;
  readonly monthly: PeriodMaintenanceResult & { readonly refs: RefsResult };
}

// 1 回の実行で Daily → 習慣 → Weekly → Monthly の順にそれぞれを最新状態にする。
// 各段階は冪等で、途中で失敗しても次回の実行が未完了分だけを処理する。
export async function runMaintenance(
  { diary, habits, pageTitles }: Dependencies,
  today: Temporal.PlainDate,
): Promise<MaintenanceSummary> {
  const dailies = await diary.listDailies();
  const daily = await maintainDailies(diary, dailies, today);

  // 習慣: 今日の分の作成だけ。件数の多い転記より前に置き、転記が失敗した日も今日のページを作る。
  const habit = await maintainHabits(habits, await habits.listHabits(), today);

  // Weekly: 作成 → 転記 → リネーム・ロック
  const preparedWeeklies = await preparePeriodPages(
    diary,
    weekly,
    dailies,
    await diary.listWeeklies(),
    today,
  );
  const weeklyResult = await settlePeriodPages(diary, preparedWeeklies, dailies, today);

  // Monthly: 作成 → 転記 → Refs → リネーム・ロック。閉じる前に、その月の外部 URL を Refs としてまとめる。
  const preparedMonthlies = await preparePeriodPages(
    diary,
    monthly,
    dailies,
    await diary.listMonthlies(),
    today,
  );
  const refs = await generateRefs(diary, pageTitles, preparedMonthlies.archives, dailies, today);
  const monthlyResult = await settlePeriodPages(diary, preparedMonthlies, dailies, today);

  return { daily, habit, weekly: weeklyResult, monthly: { ...monthlyResult, refs } };
}
