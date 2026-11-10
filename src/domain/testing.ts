import { Temporal } from "temporal-polyfill";

import { DailyPage, formatDailyTitle } from "./daily";
import { HabitPage, formatHabitTitle } from "./habit";

// テスト用の生成。エンティティの生成規則（fromRecord）を通し、検証に関係ない項目だけ既定値で埋める。

export function dailyOn(
  date: string,
  props: { readonly title?: string; readonly isLocked?: boolean; readonly id?: string; readonly createdTime?: string } = {},
): DailyPage {
  return DailyPage.fromRecord({
    id: props.id ?? `daily-${date}`,
    createdTime: props.createdTime ?? "2026-01-01T00:00:00.000Z",
    title: props.title ?? formatDailyTitle(Temporal.PlainDate.from(date)),
    isLocked: props.isLocked ?? false,
  });
}

export function habitOn(date: string): HabitPage {
  return HabitPage.fromRecord({
    id: `habit-${date}`,
    title: formatHabitTitle(Temporal.PlainDate.from(date)),
  });
}
