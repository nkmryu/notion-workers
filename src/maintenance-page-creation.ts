import type { Client } from "@notionhq/client";

import type { NotionPage } from "./notion-response";

import { formatDailyTitle } from "./date";
import {
  createPageFromTemplate,
  getDataSourceTitleKey,
} from "./notion-client";
import { planMissingMonthlyPages } from "./monthly-page";
import { shouldCreateTodayPage } from "./page-creation";
import { planMissingWeeklyPages } from "./weekly-page";

const WRITE_INTERVAL_MS = 350;

interface PageCreationEnv {
  readonly notion: Client;
  readonly templateId: string;
  readonly weeklyTemplateId: string;
  readonly monthlyTemplateId: string;
}

export interface CreatedPagesResult {
  readonly pages: readonly NotionPage[];
  readonly dailyCreated: number;
  readonly weekliesCreated: number;
  readonly monthliesCreated: number;
}

interface CreateMissingPagesInput {
  readonly pages: readonly NotionPage[];
  readonly dataSourceId: string;
  readonly env: PageCreationEnv;
  readonly now: Date;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

export async function createMissingPages(
  input: CreateMissingPagesInput,
): Promise<CreatedPagesResult> {
  const shouldCreateDaily = shouldCreateTodayPage(input.pages, input.now);
  // 今日の Daily は進行中の週・月に属し、Weekly / Monthly は期間終了後にしか作らないため、作成計画には影響しない。
  const weeklyPlans = planMissingWeeklyPages(input.pages, input.now);
  const monthlyPlans = planMissingMonthlyPages(input.pages, input.now);

  if (
    shouldCreateDaily === false &&
    weeklyPlans.length === 0 &&
    monthlyPlans.length === 0
  ) {
    return {
      pages: [],
      dailyCreated: 0,
      weekliesCreated: 0,
      monthliesCreated: 0,
    };
  }

  const titleKey = await getDataSourceTitleKey(
    input.env.notion,
    input.dataSourceId,
  );
  let createdPages: readonly NotionPage[] = [];
  // テンプレートは非同期でタイトルを上書きし得るため、作成時タイトルだけに依存せず冪等リネームを残す。
  if (shouldCreateDaily) {
    const title = formatDailyTitle(input.now);
    const pageId = await createPageFromTemplate({
      notion: input.env.notion,
      dataSourceId: input.dataSourceId,
      templateId: input.env.templateId,
      titleKey,
      title,
    });
    createdPages = [
      ...createdPages,
      {
        id: pageId,
        createdTime: input.now.toISOString(),
        isLocked: false,
        titleKey,
        currentTitle: title,
        isWeekly: false,
        isMonthly: false,
      },
    ];
  }

  for (const plan of weeklyPlans) {
    if (createdPages.length > 0) {
      await sleep(WRITE_INTERVAL_MS);
    }

    const pageId = await createPageFromTemplate({
      notion: input.env.notion,
      dataSourceId: input.dataSourceId,
      templateId: input.env.weeklyTemplateId,
      titleKey,
      title: plan.title,
    });
    createdPages = [
      ...createdPages,
      {
        id: pageId,
        // Notion の created_time は遡及できないため、同一実行内では対象週のDailyタイトル日を使って識別する。
        createdTime: plan.representativeCreatedTime,
        isLocked: false,
        titleKey,
        // テンプレートの非同期適用後にも対象週タイトルを確定させるため、同一実行でリネーム対象にする。
        currentTitle: "",
        isWeekly: true,
        isMonthly: false,
      },
    ];
  }

  for (const plan of monthlyPlans) {
    if (createdPages.length > 0) {
      await sleep(WRITE_INTERVAL_MS);
    }

    const pageId = await createPageFromTemplate({
      notion: input.env.notion,
      dataSourceId: input.dataSourceId,
      templateId: input.env.monthlyTemplateId,
      titleKey,
      title: plan.title,
    });
    createdPages = [
      ...createdPages,
      {
        id: pageId,
        // Notion の created_time は遡及できないため、同一実行内では対象月のDailyタイトル日を使って識別する。
        createdTime: plan.representativeCreatedTime,
        isLocked: false,
        titleKey,
        // テンプレートの非同期適用後にも対象月タイトルを確定させるため、同一実行でリネーム対象にする。
        currentTitle: "",
        isWeekly: false,
        isMonthly: true,
      },
    ];
  }

  return {
    pages: createdPages,
    dailyCreated: shouldCreateDaily ? 1 : 0,
    weekliesCreated: weeklyPlans.length,
    monthliesCreated: monthlyPlans.length,
  };
}
