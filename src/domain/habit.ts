import type { Temporal } from "temporal-polyfill";

import { formatDailyTitle, parseDailyTitle } from "./daily";

// 永続化されている習慣ページの姿。
export interface HabitRecord {
  readonly id: string;
  readonly title: string;
}

// 習慣の記録の 1 日分。タイトルは Daily と同じ `26.07.22（水）` で、日付はタイトルから決める。
// Daily と違って種別の列が無いので、日付として読めないタイトルの行は失敗させず、どの日の分でもない行として扱う。
// 存在しない日付（26.02.30 など）は、日付を書き間違えた行なので parseDailyTitle の規則どおり失敗させる。
export class HabitPage {
  private constructor(
    readonly id: string,
    readonly title: string,
    readonly date: Temporal.PlainDate | null,
  ) {}

  static fromRecord(record: HabitRecord): HabitPage {
    return new HabitPage(record.id, record.title, parseDailyTitle(record.title));
  }

  isOn(date: Temporal.PlainDate): boolean {
    return this.date?.equals(date) ?? false;
  }
}

export function formatHabitTitle(date: Temporal.PlainDate): string {
  return formatDailyTitle(date);
}

export function shouldCreateTodayHabitPage(
  habits: readonly HabitPage[],
  today: Temporal.PlainDate,
): boolean {
  return !habits.some(function (habit) {
    return habit.isOn(today);
  });
}
