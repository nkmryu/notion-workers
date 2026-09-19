import type { DailyPage } from "../diary/page";
import type { DiaryStore } from "./diary-store";

import { PAGE_ACTION_TYPE, decideDailyPageAction, shouldCreateTodayPage } from "../diary/daily";
import { formatDailyTitle } from "../diary/daily-title";

export interface DailyMaintenanceResult {
  readonly created: number;
  readonly renames: number;
  readonly locks: number;
}

// Daily を最新状態にする: 今日の分が無ければ作り、今日の分のタイトルを整え、過去日をロックする。
export async function maintainDailies(
  diary: DiaryStore,
  templateId: string,
  dailies: readonly DailyPage[],
  now: Date,
): Promise<DailyMaintenanceResult> {
  let created = 0;

  if (shouldCreateTodayPage(dailies, now)) {
    await diary.createPageFromTemplate({ templateId, title: formatDailyTitle(now) });
    created = 1;
  }

  let renames = 0;
  let locks = 0;

  for (const daily of dailies) {
    const action = decideDailyPageAction(daily, now);

    if (action.type === PAGE_ACTION_TYPE.rename) {
      await diary.renamePage(daily.id, action.title);
      renames += 1;
    } else if (action.type === PAGE_ACTION_TYPE.lock) {
      await diary.lockPage(daily.id);
      locks += 1;
    } else {
      continue;
    }
  }

  return { created, renames, locks };
}
