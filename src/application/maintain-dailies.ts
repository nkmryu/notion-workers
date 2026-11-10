import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { DiaryRepository, NewDaily } from "../domain/diary-repository";
import type { PageActionCounts } from "./page-actions";

import { formatDailyTitle, shouldCreateTodayPage } from "../domain/daily";
import { listAwaitingClosingDailies, planMissingClosingDailies } from "../domain/digest";
import { applyPageActions, planPageActions } from "./page-actions";
import { mapSequentially } from "../shared/sequence";

export interface DailyMaintenanceResult extends PageActionCounts {
  readonly created: number;
}

export interface MaintainedDailies {
  readonly result: DailyMaintenanceResult;
  // 作ったページを含む Daily の一覧。後の段階はこの一覧で判断する。
  readonly dailies: readonly DailyPage[];
}

// Daily を最新状態にする: 締めの日の Daily と今日の分が無ければ作り、今日の分のタイトルを整え、過去日をロックする。
// まとめを書き終えていない締めの日の Daily は、まとめの段階が閉じるのでここではロックしない。
export async function maintainDailies(
  diary: DiaryRepository,
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<MaintainedDailies> {
  const creations: readonly NewDaily[] = [
    ...planMissingClosingDailies(dailies, today),
    ...(shouldCreateTodayPage(dailies, today) ? [{ title: formatDailyTitle(today), date: today }] : []),
  ];
  const created = await mapSequentially(creations, function (daily) {
    return diary.createDaily(daily);
  });
  const allDailies = [...dailies, ...created];
  const awaitingIds = new Set(
    listAwaitingClosingDailies(allDailies, today).map(function (daily) {
      return daily.id;
    }),
  );
  const actions = dailies.flatMap(function (daily) {
    return planPageActions(daily.id, daily.decideActions(today, awaitingIds.has(daily.id)));
  });
  const counts = await applyPageActions(diary, actions);

  return { result: { created: created.length, ...counts }, dailies: allDailies };
}
