import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { DiaryRepository } from "../domain/diary-repository";
import type { PeriodArchive, PeriodDefinition, PeriodPage } from "../domain/period";
import type { PageActionCounts } from "./page-actions";

import { EMPTY_TRANSFER_STATE, PeriodPage as PeriodPageEntity, planMissingPeriodPages } from "../domain/period";
import { deriveTransferState } from "../domain/transfer";
import { mapSequentially } from "../shared/sequence";
import { applyPageActions, planPageActions } from "./page-actions";
import { transferEndedDailies } from "./transfer-dailies";

export interface PreparedPeriod<K> {
  readonly archives: readonly PeriodArchive<K>[];
  readonly created: number;
  readonly daysTransferred: number;
  readonly fallbackDates: readonly Temporal.PlainDate[];
}

export interface PeriodMaintenanceResult extends PageActionCounts {
  readonly created: number;
  readonly daysTransferred: number;
  readonly fallbackDates: readonly Temporal.PlainDate[];
}

async function createMissingPages<K>(
  diary: DiaryRepository,
  period: PeriodDefinition<K>,
  dailies: readonly DailyPage[],
  existingPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
): Promise<readonly PeriodPage<K>[]> {
  return mapSequentially(
    planMissingPeriodPages(period, dailies, existingPages, today),
    async function (plan) {
      const id = await diary.createPeriodPage(period.type, plan.title);
      return PeriodPageEntity.created(period, id, plan.key);
    },
  );
}

// 既存ページは本文から転記状態を読む。もう手を入れないページは読まなくても状態が決まる。
function readArchives<K>(
  diary: DiaryRepository,
  pages: readonly PeriodPage<K>[],
): Promise<readonly PeriodArchive<K>[]> {
  return mapSequentially(pages, async function (page) {
    return page.withTransferState(
      page.isSettled() ? EMPTY_TRANSFER_STATE : deriveTransferState(await diary.getSectionTitles(page.id)),
    );
  });
}

// 期間ページを閉じる前の段階: 終了した期間のページを作り、Daily を転記して、転記状態の揃った期間ページを返す。
export async function preparePeriodPages<K>(
  diary: DiaryRepository,
  period: PeriodDefinition<K>,
  dailies: readonly DailyPage[],
  existingPages: readonly PeriodPage<K>[],
  today: Temporal.PlainDate,
): Promise<PreparedPeriod<K>> {
  const createdPages = await createMissingPages(diary, period, dailies, existingPages, today);
  const archives = [
    ...(await readArchives(diary, existingPages)),
    // 作成直後のページが空であることは、作成した側だけが知っている。
    ...createdPages.map(function (page) {
      return page.withTransferState(EMPTY_TRANSFER_STATE);
    }),
  ];
  const transfer = await transferEndedDailies(diary, dailies, archives, today);

  return {
    archives: transfer.archives,
    created: createdPages.length,
    daysTransferred: transfer.daysTransferred,
    fallbackDates: transfer.fallbackDates,
  };
}

// 期間ページを閉じる段階: タイトルを整え、転記の揃った過去の期間をロックする。
export async function settlePeriodPages<K>(
  diary: DiaryRepository,
  prepared: PreparedPeriod<K>,
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<PeriodMaintenanceResult> {
  const actions = prepared.archives.flatMap(function (archive) {
    return planPageActions(archive.id, archive.decideActions(dailies, today));
  });
  const counts = await applyPageActions(diary, actions);

  return {
    created: prepared.created,
    daysTransferred: prepared.daysTransferred,
    fallbackDates: prepared.fallbackDates,
    ...counts,
  };
}
