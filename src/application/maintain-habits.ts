import type { Temporal } from "temporal-polyfill";

import type { HabitPage } from "../domain/habit";
import type { HabitRepository } from "../domain/habit-repository";

import { formatHabitTitle, shouldCreateTodayHabitPage } from "../domain/habit";
import { mapSequentially } from "../shared/sequence";

export interface HabitMaintenanceResult {
  readonly created: number;
}

// 習慣を最新状態にする: 今日の分が無ければ作る。過去日のページには触れない。
export async function maintainHabits(
  habits: HabitRepository,
  pages: readonly HabitPage[],
  today: Temporal.PlainDate,
): Promise<HabitMaintenanceResult> {
  const creations = shouldCreateTodayHabitPage(pages, today) ? [formatHabitTitle(today)] : [];

  await mapSequentially(creations, function (title) {
    return habits.createHabit(title);
  });

  return { created: creations.length };
}
