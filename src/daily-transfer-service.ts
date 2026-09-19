import type { Client } from "@notionhq/client";

import type {
  DailyTransferPage,
  MonthlyTransferPage,
  WeeklyTransferPage,
} from "./daily-transfer";
import type { NotionPage } from "./notion-response";
import type { DailyMarkdown } from "./transfer-markdown";

import {
  planDailyTransfers,
  planMonthlyDailyTransfers,
} from "./daily-transfer";
import { getMonthlyPageMonth } from "./monthly-page";
import { restoreExternalLinks } from "./block-link-resolver";
import { appendMarkdown, getPageMarkdown } from "./notion-client";
import { isNotionValidationError } from "./notion-error";
import {
  createTransferFallbackSection,
  createTransferSection,
  extractHeadingTitles,
} from "./transfer-markdown";
import { getWeeklyPageWeek } from "./weekly-page";

const READ_INTERVAL_MS = 150;
const WRITE_INTERVAL_MS = 350;

export interface TransferResult<T> {
  readonly destinations: readonly T[];
  readonly daysTransferred: number;
  readonly transferFallbackDates: readonly string[];
}

interface TransferExecutionPlan {
  readonly dailyPageIds: readonly string[];
  readonly destinationPageId: string;
  readonly title: string;
}

interface TransferHeadingPage {
  readonly id: string;
  readonly headingTitles: readonly string[];
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

async function getHeadingTitles(
  notion: Client,
  pageId: string,
): Promise<readonly string[]> {
  const headingTitles = extractHeadingTitles(
    await getPageMarkdown(notion, pageId),
  );
  await sleep(READ_INTERVAL_MS);

  return headingTitles;
}

async function getWeeklyTransferPages(
  notion: Client,
  pages: readonly NotionPage[],
  knownEmptyPageIds: readonly string[],
): Promise<readonly WeeklyTransferPage[]> {
  let weeklies: readonly WeeklyTransferPage[] = [];

  for (const page of pages) {
    if (!page.isWeekly) {
      continue;
    }

    // ロック済み Weekly には転記しないため、見出しの読み取りを省く。
    const headingTitles =
      page.isLocked || knownEmptyPageIds.includes(page.id)
        ? []
        : await getHeadingTitles(notion, page.id);
    weeklies = [
      ...weeklies,
      {
        id: page.id,
        week: getWeeklyPageWeek(page),
        isLocked: page.isLocked,
        headingTitles,
      },
    ];
  }

  return weeklies;
}

async function getMonthlyTransferPages(
  notion: Client,
  pages: readonly NotionPage[],
  knownEmptyPageIds: readonly string[],
): Promise<readonly MonthlyTransferPage[]> {
  let monthlies: readonly MonthlyTransferPage[] = [];

  for (const page of pages) {
    if (!page.isMonthly) {
      continue;
    }

    // ロック済みでも Refs 未生成の月を拾うため、同一実行で作成した空ページ以外は見出しを読む。
    const headingTitles = knownEmptyPageIds.includes(page.id)
      ? []
      : await getHeadingTitles(notion, page.id);
    monthlies = [
      ...monthlies,
      {
        id: page.id,
        month: getMonthlyPageMonth(page),
        isLocked: page.isLocked,
        headingTitles,
      },
    ];
  }

  return monthlies;
}

async function getDailyMarkdowns(
  notion: Client,
  dailyPageIds: readonly string[],
): Promise<readonly DailyMarkdown[]> {
  let dailies: readonly DailyMarkdown[] = [];

  for (const pageId of dailyPageIds) {
    const markdown = await getPageMarkdown(notion, pageId);
    await sleep(READ_INTERVAL_MS);
    dailies = [
      ...dailies,
      { pageId, markdown: await restoreExternalLinks(notion, markdown) },
    ];
  }

  return dailies;
}

async function executeTransferPlans<T extends TransferHeadingPage>(
  notion: Client,
  plans: readonly TransferExecutionPlan[],
  destinations: readonly T[],
): Promise<TransferResult<T>> {
  let currentDestinations = destinations;
  let transferFallbackDates: readonly string[] = [];

  for (const plan of plans) {
    const dailies = await getDailyMarkdowns(notion, plan.dailyPageIds);

    try {
      await appendMarkdown(
        notion,
        plan.destinationPageId,
        createTransferSection(plan.title, dailies),
      );
    } catch (error: unknown) {
      // 認証・レート制限・通信障害まで継続すると復旧判断を誤るため、書式検証エラー以外は再 throw する。
      if (!isNotionValidationError(error)) {
        throw error;
      }

      await sleep(WRITE_INTERVAL_MS);
      await appendMarkdown(
        notion,
        plan.destinationPageId,
        createTransferFallbackSection(plan.title, plan.dailyPageIds),
      );
      transferFallbackDates = [...transferFallbackDates, plan.title];
    }

    await sleep(WRITE_INTERVAL_MS);
    currentDestinations = currentDestinations.map(function (destination) {
      if (destination.id !== plan.destinationPageId) {
        return destination;
      }

      return {
        ...destination,
        headingTitles: [...destination.headingTitles, plan.title],
      };
    });
  }

  return {
    destinations: currentDestinations,
    daysTransferred: plans.length,
    transferFallbackDates,
  };
}

function toDailyTransferPages(
  pages: readonly NotionPage[],
): readonly DailyTransferPage[] {
  return pages.map(function (page) {
    return {
      id: page.id,
      createdTime: page.createdTime,
      currentTitle: page.currentTitle,
      isWeekly: page.isWeekly,
      isMonthly: page.isMonthly,
    };
  });
}

export async function transferEndedDailyPages(
  notion: Client,
  pages: readonly NotionPage[],
  now: Date,
  knownEmptyWeeklyIds: readonly string[] = [],
): Promise<TransferResult<WeeklyTransferPage>> {
  const weeklies = await getWeeklyTransferPages(
    notion,
    pages,
    knownEmptyWeeklyIds,
  );
  const plans = planDailyTransfers(toDailyTransferPages(pages), weeklies, now);

  return executeTransferPlans(
    notion,
    plans.map(function (plan) {
      return { ...plan, destinationPageId: plan.weeklyPageId };
    }),
    weeklies,
  );
}

export async function transferEndedDailyPagesToMonthlies(
  notion: Client,
  pages: readonly NotionPage[],
  now: Date,
  knownEmptyMonthlyIds: readonly string[] = [],
): Promise<TransferResult<MonthlyTransferPage>> {
  const monthlies = await getMonthlyTransferPages(
    notion,
    pages,
    knownEmptyMonthlyIds,
  );
  const plans = planMonthlyDailyTransfers(
    toDailyTransferPages(pages),
    monthlies,
    now,
  );

  return executeTransferPlans(
    notion,
    plans.map(function (plan) {
      return { ...plan, destinationPageId: plan.monthlyPageId };
    }),
    monthlies,
  );
}
