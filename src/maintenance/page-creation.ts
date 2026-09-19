import type { Config } from "../config";
import type { DiaryPage } from "../diary/page";
import type { PeriodCreationPlan, PeriodDefinition } from "../diary/period";

import { shouldCreateTodayPage } from "../diary/daily";
import { formatDailyTitle } from "../diary/daily-title";
import { monthly } from "../diary/monthly";
import { planMissingPeriodPages } from "../diary/period";
import { weekly } from "../diary/weekly";
import { WRITE_INTERVAL_MS, sleep } from "../notion/pacing";

export interface PageCreationResult {
  readonly pages: readonly DiaryPage[];
  readonly dailyCreated: number;
  readonly weekliesCreated: number;
  readonly monthliesCreated: number;
}

async function createPeriodPages<K>(
  config: Config,
  period: PeriodDefinition<K>,
  templateId: string,
  plans: readonly PeriodCreationPlan<K>[],
  titleKey: string,
): Promise<readonly DiaryPage[]> {
  let created: readonly DiaryPage[] = [];

  for (const plan of plans) {
    const pageId = await config.diary.createPageFromTemplate({
      templateId,
      titleKey,
      title: plan.title,
    });
    await sleep(WRITE_INTERVAL_MS);
    created = [
      ...created,
      {
        id: pageId,
        createdTime: plan.representativeCreatedTime,
        // テンプレートの非同期適用後にも期間タイトルを確定させるため、同一実行でリネーム対象にする。
        title: "",
        isLocked: false,
        periodType: period.type,
      },
    ];
  }

  return created;
}

export async function createMissingPages(
  config: Config,
  pages: readonly DiaryPage[],
  now: Date,
): Promise<PageCreationResult> {
  const shouldCreateDaily = shouldCreateTodayPage(pages, now);
  // 今日の Daily は進行中の週・月に属し、期間ページは期間終了後にしか作らないため、作成計画には影響しない。
  const weeklyPlans = planMissingPeriodPages(weekly, pages, now);
  const monthlyPlans = planMissingPeriodPages(monthly, pages, now);
  const empty = { pages: [], dailyCreated: 0, weekliesCreated: 0, monthliesCreated: 0 };

  if (!shouldCreateDaily && weeklyPlans.length === 0 && monthlyPlans.length === 0) {
    return empty;
  }

  const titleKey = await config.diary.getTitleKey();
  let dailyPages: readonly DiaryPage[] = [];

  if (shouldCreateDaily) {
    const title = formatDailyTitle(now);
    const pageId = await config.diary.createPageFromTemplate({
      templateId: config.dailyTemplateId,
      titleKey,
      title,
    });
    await sleep(WRITE_INTERVAL_MS);
    // テンプレートは非同期でタイトルを上書きし得るため、作成時タイトルだけに依存せず冪等リネームを残す。
    dailyPages = [
      { id: pageId, createdTime: now.toISOString(), title, isLocked: false, periodType: null },
    ];
  }

  const weeklyPages = await createPeriodPages(
    config,
    weekly,
    config.weeklyTemplateId,
    weeklyPlans,
    titleKey,
  );
  const monthlyPages = await createPeriodPages(
    config,
    monthly,
    config.monthlyTemplateId,
    monthlyPlans,
    titleKey,
  );

  return {
    pages: [...dailyPages, ...weeklyPages, ...monthlyPages],
    dailyCreated: dailyPages.length,
    weekliesCreated: weeklyPages.length,
    monthliesCreated: monthlyPages.length,
  };
}
