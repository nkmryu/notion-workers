import type { Temporal } from "temporal-polyfill";

import type { DailyPage } from "../domain/daily";
import type { DiaryRepository } from "../domain/diary-repository";
import type { CarriedSection, DigestPeriod, TransferPlan } from "../domain/digest";
import type { CollectedRef, ResolvedRef } from "../domain/refs";
import type { WebPageTitleLookup } from "./web-page-title-lookup";

import { ContentRejectedError } from "../domain/diary-repository";
import {
  DigestTarget,
  TRANSFER_SOURCE,
  WEEKLY_CLEANUP,
  decideWeeklyCleanup,
  deriveDigestState,
  extractCarriedSections,
  extractOwnBody,
  findClosingDaily,
  listDueDigestPeriods,
  listWeeklyDigestPlaces,
  selectRetiredDailies,
} from "../domain/digest";
import { createDigestHeader } from "../domain/markdown-section";
import { buildRefsSection, collectRefs, selectRefTitle } from "../domain/refs";
import { createTransferFallbackSection, createTransferSection } from "../domain/transfer-markdown";
import { countBy, mapSequentially } from "../shared/sequence";
import { applyPageActions, planPageActions } from "./page-actions";

export interface DigestResult {
  // まとめを書いた締めの日の Daily の数
  readonly targets: number;
  readonly daysTransferred: number;
  // 本文の拒否で案内文へ切り替えた日
  readonly fallbackDates: readonly Temporal.PlainDate[];
  readonly refs: number;
  // 月のまとめに置き換わり、週のまとめを消した日曜の Daily の数（ゴミ箱へ移したものは含めない）
  readonly weeklyDigestsRemoved: number;
  // 週のまとめを除くと本文が空なので、ゴミ箱へ移した日曜の Daily の数
  readonly sundaysTrashed: number;
  // 月のまとめに置き換わり、ゴミ箱へ移した普通の日の Daily の数
  readonly dailiesTrashed: number;
  readonly locks: number;
}

type WeeklyCleanupType = (typeof WEEKLY_CLEANUP)[keyof typeof WEEKLY_CLEANUP];

interface DigestOutcome {
  readonly target: DigestTarget;
  readonly daysTransferred: number;
  readonly fallbackDates: readonly Temporal.PlainDate[];
  readonly refsWritten: boolean;
  readonly cleanups: readonly WeeklyCleanupType[];
  readonly dailiesTrashed: number;
}

// 月のまとめへ写す、その月の日曜の Daily にある週のまとめの節。週のまとめの期間では読まない。
async function readCarriedSections(
  diary: DiaryRepository,
  period: DigestPeriod,
  dailies: readonly DailyPage[],
): Promise<readonly CarriedSection[]> {
  const sections = await mapSequentially(listWeeklyDigestPlaces(period, dailies), async function ({ dailyId, label }) {
    const parts = await diary.getDigestParts(dailyId, label);
    return parts === null ? [] : extractCarriedSections(parts.digest);
  });

  return sections.flat();
}

// 書く時期が来た期間のうち、締めの日の Daily がまだロックされていないものを読む。
// ロック済みの締めの日は、まとめを書き終えているので読み直さない。
function readTargets(
  diary: DiaryRepository,
  dailies: readonly DailyPage[],
  today: Temporal.PlainDate,
): Promise<readonly DigestTarget[]> {
  const pending = listDueDigestPeriods(dailies, today).flatMap(function (period) {
    const closing = findClosingDaily(period, dailies);
    return closing === null || closing.isLocked ? [] : [{ period, closing }];
  });

  return mapSequentially(pending, async function ({ period, closing }) {
    const titles = await diary.getDigestSectionTitles(closing.id, period.label);
    const carried = await readCarriedSections(diary, period, dailies);
    return new DigestTarget(period, closing, deriveDigestState(titles), carried);
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
  if (plan.source === TRANSFER_SOURCE.weeklyDigest) {
    // 週のまとめの節は一度 Notion が受け付けた本文なので、拒まれても注記へ切り替えずに止める。
    // 注記にすると、この後で週のまとめを消したときに、その日の本文がどこにも残らない。
    await diary.appendMarkdown(destinationPageId, createTransferSection(plan.heading, [plan.body]));
    return { fellBack: false };
  }

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

// 月のまとめに置き換わった週のまとめを、その月の日曜の Daily から消す。
// 本文が空の日曜は Daily ごとゴミ箱へ移す。消し終えた日曜はまとめの見出しが無いので、再実行では何もしない。
function removeReplacedWeeklyDigests(
  diary: DiaryRepository,
  target: DigestTarget,
  dailies: readonly DailyPage[],
): Promise<readonly WeeklyCleanupType[]> {
  return mapSequentially(target.listReplacedWeeklyDigests(dailies), async function ({ dailyId, label }) {
    const cleanup = decideWeeklyCleanup(await diary.getDigestParts(dailyId, label));

    switch (cleanup.type) {
      case WEEKLY_CLEANUP.removeDigest:
        await diary.deleteMarkdown(dailyId, cleanup.digest);
        break;
      case WEEKLY_CLEANUP.trashPage:
        await diary.trashPage(dailyId);
        break;
      case WEEKLY_CLEANUP.none:
        break;
    }

    return cleanup.type;
  });
}

// 月のまとめに置き換わった普通の日の Daily をゴミ箱へ移す。本文を写せなかった日は残す。
// 移した Daily は一覧に出なくなるので、再実行では残りだけを移す。
async function retireOrdinaryDailies(
  diary: DiaryRepository,
  target: DigestTarget,
  dailies: readonly DailyPage[],
): Promise<number> {
  const candidates = target.listOrdinaryDailies(dailies);

  if (candidates.length === 0) {
    return 0;
  }

  const parts = await diary.getDigestParts(target.id, target.label);
  const retired = selectRetiredDailies(candidates, parts?.digest ?? null);
  await mapSequentially(retired, function (daily) {
    return diary.trashPage(daily.id);
  });

  return retired.length;
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
  const written = withRefs ?? transferred;
  // 月末の Daily のロックは、週のまとめの消去と普通の日の移動を終えた印も兼ねる。どちらもロックより前に済ませる。
  const cleanups = await removeReplacedWeeklyDigests(diary, written, dailies);
  const dailiesTrashed = await retireOrdinaryDailies(diary, written, dailies);

  return {
    target: written,
    daysTransferred: plans.length,
    fallbackDates: plans.flatMap(function (plan, index) {
      return outcomes[index]?.fellBack ? [plan.date] : [];
    }),
    refsWritten: withRefs !== null,
    cleanups,
    dailiesTrashed,
  };
}

// 今月の終わった週と、終わった月のまとめを締めの日の Daily の末尾に書く。
// 月のまとめを写し終えたら、その月の週のまとめを消し、普通の日の Daily をゴミ箱へ移す。
// 期間の全日が揃ったら締めの日の Daily をロックする。
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

  const cleanupCounts = countBy(
    outcomes.flatMap(function ({ cleanups }) {
      return cleanups;
    }),
    function (cleanup) {
      return cleanup;
    },
    [WEEKLY_CLEANUP.removeDigest, WEEKLY_CLEANUP.trashPage],
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
    weeklyDigestsRemoved: cleanupCounts[WEEKLY_CLEANUP.removeDigest],
    sundaysTrashed: cleanupCounts[WEEKLY_CLEANUP.trashPage],
    dailiesTrashed: outcomes.reduce(function (total, { dailiesTrashed }) {
      return total + dailiesTrashed;
    }, 0),
    locks: counts.locks,
  };
}
