import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { DiaryRepository } from "../domain/diary-repository";
import type { TransferPlan } from "../domain/digest";
import type { CollectedRef, ResolvedRef } from "../domain/refs";
import type { WebPageTitleLookup } from "./web-page-title-lookup";

import { ContentRejectedError } from "../domain/diary-repository";
import {
  DigestTarget,
  deriveDigestState,
  extractOwnBody,
  findClosingDaily,
  listEndedDigestPeriods,
} from "../domain/digest";
import { createDigestHeader } from "../domain/markdown-section";
import { buildRefsSection, collectRefs, selectRefTitle } from "../domain/refs";
import { createTransferFallbackSection, createTransferSection } from "../domain/transfer-markdown";
import { mapSequentially } from "../shared/sequence";
import { applyPageActions, planPageActions } from "./page-actions";

export interface DigestResult {
  // まとめを書いた締めの日の Daily の数
  readonly targets: number;
  readonly daysTransferred: number;
  // 本文の拒否で案内文へ切り替えた日
  readonly fallbackDates: readonly Temporal.PlainDate[];
  readonly refs: number;
  readonly locks: number;
}

interface DigestOutcome {
  readonly target: DigestTarget;
  readonly daysTransferred: number;
  readonly fallbackDates: readonly Temporal.PlainDate[];
  readonly refsWritten: boolean;
}

// 終わった期間のうち、締めの日の Daily がまだロックされていないものを読む。
// ロック済みの締めの日は、まとめを書き終えているので読み直さない。
function readTargets(
  diary: DiaryRepository,
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<readonly DigestTarget[]> {
  const pending = listEndedDigestPeriods(dailies, today).flatMap(function (period) {
    const closing = findClosingDaily(period, dailies);
    return closing === null || closing.isLocked ? [] : [{ period, closing }];
  });

  return mapSequentially(pending, async function ({ period, closing }) {
    const titles = await diary.getDigestSectionTitles(closing.id, period.label);
    return new DigestTarget(period, closing, deriveDigestState(titles));
  });
}

async function ensureHeader(diary: DiaryRepository, target: DigestTarget): Promise<DigestTarget> {
  if (target.state.hasHeader) {
    return target;
  }

  await diary.appendMarkdown(target.id, createDigestHeader(target.label));
  return target.withHeader();
}

async function transferOne(
  diary: DiaryRepository,
  destinationPageId: string,
  plan: TransferPlan,
): Promise<{ readonly fellBack: boolean }> {
  const bodies = await mapSequentially(plan.dailyPageIds, async function (pageId) {
    return extractOwnBody(await diary.getPageMarkdown(pageId), plan.date);
  });

  try {
    await diary.appendMarkdown(destinationPageId, createTransferSection(plan.heading, bodies));
    return { fellBack: false };
  } catch (error: unknown) {
    // 認証・レート制限・通信障害まで継続すると復旧判断を誤るため、本文の拒否以外は再 throw する。
    if (!(error instanceof ContentRejectedError)) {
      throw error;
    }
    await diary.appendMarkdown(
      destinationPageId,
      createTransferFallbackSection(plan.heading, plan.dailyPageIds.map(diary.mentionOf)),
    );
    return { fellBack: true };
  }
}

// アンカーテキストが無い URL だけ、リンク先ページのタイトルを引く。
function resolveRefTitles(
  titles: WebPageTitleLookup,
  refs: readonly CollectedRef[],
): Promise<readonly ResolvedRef[]> {
  return mapSequentially(refs, async function (ref) {
    const linkedPageTitle = ref.anchorTitle === null ? await titles.lookupTitle(ref.url) : null;
    const { url, title } = selectRefTitle(ref, linkedPageTitle);
    return { url, title };
  });
}

// 月のまとめの最後に、締めの日の Daily 全体（その日の本文と転記した本文）の外部 URL を Refs としてまとめる。
// 対象の URL が無い月にはセクションを作らない。
async function writeRefs(
  diary: DiaryRepository,
  titles: WebPageTitleLookup,
  target: DigestTarget,
): Promise<DigestTarget | null> {
  const section = buildRefsSection(
    await resolveRefTitles(titles, collectRefs(await diary.getPageMarkdown(target.id))),
  );

  if (section === "") {
    return null;
  }

  const withHeader = await ensureHeader(diary, target);
  await diary.appendMarkdown(withHeader.id, section);
  return withHeader.withRefs();
}

async function writeDigest(
  diary: DiaryRepository,
  titles: WebPageTitleLookup,
  target: DigestTarget,
  dailies: readonly DailyPage[],
): Promise<DigestOutcome> {
  const plans = target.planTransfers(dailies);
  const withHeader = plans.length > 0 ? await ensureHeader(diary, target) : target;
  const outcomes = await mapSequentially(plans, function (plan) {
    return transferOne(diary, withHeader.id, plan);
  });
  // 案内文へ切り替えた日も見出しが立つので、転記済みとして同じ実行のロック判定へ反映する。
  const transferred = plans.reduce(function (current, plan) {
    return current.withTransferred(plan.date);
  }, withHeader);
  const withRefs = transferred.needsRefs ? await writeRefs(diary, titles, transferred) : null;

  return {
    target: withRefs ?? transferred,
    daysTransferred: plans.length,
    fallbackDates: plans.flatMap(function (plan, index) {
      return outcomes[index]?.fellBack ? [plan.date] : [];
    }),
    refsWritten: withRefs !== null,
  };
}

// 終わった週・月のまとめを締めの日の Daily の末尾に書き、期間の全日が揃ったら締めの日の Daily をロックする。
// 途中で失敗したら、その実行ではロックせずに止まり、次の実行が見出しを手がかりに続きから書く。
export async function writeDigests(
  diary: DiaryRepository,
  titles: WebPageTitleLookup,
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<DigestResult> {
  const targets = await readTargets(diary, dailies, today);
  const outcomes = await mapSequentially(targets, function (target) {
    return writeDigest(diary, titles, target, dailies);
  });
  const counts = await applyPageActions(
    diary,
    outcomes.flatMap(function ({ target }) {
      return planPageActions(target.id, target.decideActions(dailies));
    }),
  );

  return {
    targets: targets.length,
    daysTransferred: outcomes.reduce(function (total, { daysTransferred }) {
      return total + daysTransferred;
    }, 0),
    fallbackDates: outcomes.flatMap(function ({ fallbackDates }) {
      return fallbackDates;
    }),
    refs: outcomes.filter(function ({ refsWritten }) {
      return refsWritten;
    }).length,
    locks: counts.locks,
  };
}
