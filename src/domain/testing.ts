import type { PeriodDefinition, TransferState } from "./period";

import { Temporal } from "temporal-polyfill";

import { DailyPage, formatDailyTitle } from "./daily";
import { PeriodArchive, PeriodPage } from "./period";

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

// 期間ページ。期間はタイトルから解決されるが、空や仮のタイトルの場合に備えて作成日も期間内の日にしておく。
export function periodPageOf<K>(
  period: PeriodDefinition<K>,
  key: K,
  props: { readonly id?: string; readonly title?: string; readonly isLocked?: boolean } = {},
): PeriodPage<K> {
  return PeriodPage.fromRecord(period, {
    id: props.id ?? `${period.type}-${period.formatTitle(key)}`,
    createdTime: createdTimeIn(period, key),
    title: props.title ?? period.formatTitle(key),
    isLocked: props.isLocked ?? false,
  });
}

// 期間内のある日の JST 12:00 を作成日にする。
function createdTimeIn<K>(period: PeriodDefinition<K>, key: K): string {
  const date = Array.from({ length: 4 * 366 }, function (_, offset) {
    return Temporal.PlainDate.from("2024-01-01").add({ days: offset });
  }).find(function (candidate) {
    return period.compare(period.periodOf(candidate), key) === 0;
  });

  if (date === undefined) {
    throw new Error(`テスト用の期間に対応する日付が見つかりません: ${period.formatTitle(key)}`);
  }

  return `${date.toString()}T03:00:00.000Z`;
}

export function archiveOf<K>(
  period: PeriodDefinition<K>,
  key: K,
  props: {
    readonly id?: string;
    readonly title?: string;
    readonly isLocked?: boolean;
    readonly transferredDates?: readonly Temporal.PlainDate[];
    readonly hasRefs?: boolean;
  } = {},
): PeriodArchive<K> {
  const state: TransferState = {
    transferredDates: props.transferredDates ?? [],
    hasRefs: props.hasRefs ?? false,
  };

  return periodPageOf(period, key, props).withTransferState(state);
}

export function dates(...texts: readonly string[]): readonly Temporal.PlainDate[] {
  return texts.map(function (text) {
    return Temporal.PlainDate.from(text);
  });
}
