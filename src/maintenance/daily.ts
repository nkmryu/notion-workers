import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../diary/daily";
import type { DiaryStore } from "./diary-store";
import type { PageActionCounts } from "./page-actions";

import { formatDailyTitle, shouldCreateTodayPage } from "../diary/daily";
import { applyPageActions, planPageAction } from "./page-actions";
import { mapSequentially } from "../shared/sequence";

export interface DailyMaintenanceResult extends PageActionCounts {
  readonly created: number;
}

// Daily を最新状態にする: 今日の分が無ければ作り、今日の分のタイトルを整え、過去日をロックする。
export async function maintainDailies(
  diary: DiaryStore,
  templateId: string,
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<DailyMaintenanceResult> {
  const creations = shouldCreateTodayPage(dailies, today) ? [formatDailyTitle(today)] : [];
  const actions = dailies.flatMap(function (daily) {
    return planPageAction(daily.id, daily.decideAction(today));
  });

  await mapSequentially(creations, function (title) {
    return diary.createPageFromTemplate({ templateId, title });
  });
  const counts = await applyPageActions(diary, actions);

  return { created: creations.length, ...counts };
}
