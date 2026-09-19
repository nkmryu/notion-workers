import type { Client } from "@notionhq/client";

import {
  getAllPages,
  lockPage,
  renamePage,
} from "./notion-client";
import {
  createPageActionContext,
  decidePageActionWithContext,
} from "./page-action";
import type { PageAction, PageActionContext, PageState } from "./page-action";
import type {
  MonthlyTransferPage,
  WeeklyTransferPage,
} from "./daily-transfer";
import type { NotionPage } from "./notion-response";
import type { WeeklyPageActionContext } from "./weekly-page";

import {
  transferEndedDailyPages,
  transferEndedDailyPagesToMonthlies,
} from "./daily-transfer-service";
import { createMissingPages } from "./maintenance-page-creation";
import { generateMonthlyRefs } from "./monthly-refs-service";
import { planMonthlyFinalizationSteps } from "./monthly-refs";
import {
  createMonthlyPageActionContext,
  decideMonthlyPageActionWithContext,
  shouldLockMonthlyPage,
} from "./monthly-page";
import type { MonthlyPageActionContext } from "./monthly-page";
import {
  createWeeklyPageActionContext,
  decideWeeklyPageActionWithContext,
  shouldLockWeeklyPage,
} from "./weekly-page";

const WRITE_INTERVAL_MS = 350;

export interface Env {
  readonly notion: Client;
  readonly dataSourceId: string;
  readonly templateId: string;
  readonly weeklyTemplateId: string;
  readonly monthlyTemplateId: string;
}

export interface MaintenanceSummary {
  readonly dailyCreated: number;
  readonly weekliesCreated: number;
  readonly monthliesCreated: number;
  readonly daysTransferred: number;
  readonly transferFallbacks: number;
  readonly transferFallbackDates: readonly string[];
  readonly monthlyDaysTransferred: number;
  readonly monthlyTransferFallbacks: number;
  readonly monthlyTransferFallbackDates: readonly string[];
  readonly monthlyRefsGenerated: number;
  readonly monthlyRefsProcessed: number;
  readonly monthlyRefTitlesResolved: number;
  readonly monthlyRefAnchorTitles: number;
  readonly monthlyRefTitleFallbacks: number;
  readonly renames: number;
  readonly locks: number;
}

type PlannedAction =
  | {
      readonly type: "rename";
      readonly pageId: string;
      readonly titleKey: string;
      readonly title: string;
    }
  | { readonly type: "lock"; readonly pageId: string };

function sleep(milliseconds: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

function planActions(
  pages: readonly NotionPage[],
  weeklyTransferPages: readonly WeeklyTransferPage[],
  monthlyTransferPages: readonly MonthlyTransferPage[],
  now: Date,
): readonly PlannedAction[] {
  const dailyContext = createPageActionContext(now);
  const weeklyContext = createWeeklyPageActionContext(now);
  const monthlyContext = createMonthlyPageActionContext(now);

  return pages.flatMap<PlannedAction>(function (page) {
    const transferPage = weeklyTransferPages.find(function (weekly) {
      return weekly.id === page.id;
    });
    const monthlyTransferPage = monthlyTransferPages.find(function (monthly) {
      return monthly.id === page.id;
    });
    const canLockWeekly = shouldLockWeeklyPage(
      page,
      pages,
      transferPage?.headingTitles ?? [],
      now,
    );
    const canLockMonthly = shouldLockMonthlyPage(
      page,
      pages,
      monthlyTransferPage?.headingTitles ?? [],
      now,
    );
    const action = decideMaintenanceAction(
      page,
      dailyContext,
      weeklyContext,
      monthlyContext,
      canLockWeekly,
      canLockMonthly,
    );

    if (action.type === "none") {
      return [];
    }

    if (action.type === "rename") {
      return [
        {
          type: "rename" as const,
          pageId: page.id,
          titleKey: page.titleKey,
          title: action.title,
        },
      ];
    }

    return [{ type: "lock" as const, pageId: page.id }];
  });
}

function decideMaintenanceAction(
  page: PageState,
  dailyContext: PageActionContext,
  weeklyContext: WeeklyPageActionContext,
  monthlyContext: MonthlyPageActionContext,
  canLockWeekly: boolean,
  canLockMonthly: boolean,
): PageAction {
  if (page.isWeekly) {
    return decideWeeklyPageActionWithContext(
      page,
      weeklyContext,
      canLockWeekly,
    );
  }

  if (page.isMonthly === true) {
    return decideMonthlyPageActionWithContext(
      page,
      monthlyContext,
      canLockMonthly,
    );
  }

  return decidePageActionWithContext(page, dailyContext);
}

function getMonthlyLockPageIds(
  actions: readonly PlannedAction[],
  pages: readonly NotionPage[],
): readonly string[] {
  return actions.flatMap<string>(function (action) {
    if (action.type !== "lock") {
      return [];
    }

    const page = pages.find(function (candidate) {
      return candidate.id === action.pageId;
    });
    return page?.isMonthly === true ? [page.id] : [];
  });
}

async function applyAction(notion: Client, action: PlannedAction): Promise<void> {
  if (action.type === "rename") {
    await renamePage(notion, action.pageId, action.titleKey, action.title);
    return;
  }

  await lockPage(notion, action.pageId);
}

export async function runDailyMaintenance(
  env: Env,
  now: Date,
): Promise<MaintenanceSummary> {
  const pages = await getAllPages(env.notion, env.dataSourceId);
  const created = await createMissingPages({
    pages,
    dataSourceId: env.dataSourceId,
    env,
    now,
  });
  const currentPages = [...pages, ...created.pages];
  const createdWeeklyIds = created.pages.flatMap<string>(function (page) {
    return page.isWeekly ? [page.id] : [];
  });
  const createdMonthlyIds = created.pages.flatMap<string>(function (page) {
    return page.isMonthly ? [page.id] : [];
  });
  const transfer = await transferEndedDailyPages(
    env.notion,
    currentPages,
    now,
    createdWeeklyIds,
  );
  const monthlyTransfer = await transferEndedDailyPagesToMonthlies(
    env.notion,
    currentPages,
    now,
    createdMonthlyIds,
  );
  const actions = planActions(
    currentPages,
    transfer.destinations,
    monthlyTransfer.destinations,
    now,
  );
  const monthlyLockPageIds = getMonthlyLockPageIds(actions, currentPages);
  const finalizationSteps = planMonthlyFinalizationSteps(
    monthlyLockPageIds,
    monthlyLockPageIds,
  );
  const refsBeforeLockPageIds = finalizationSteps.flatMap<string>(function (
    step,
  ) {
    return step.type === "generate_refs" ? [step.pageId] : [];
  });
  const monthlyRefs = await generateMonthlyRefs({
    pages: currentPages,
    monthlies: monthlyTransfer.destinations,
    monthlyLockPageIds: refsBeforeLockPageIds,
    now,
    notion: env.notion,
  });

  for (const [index, action] of actions.entries()) {
    if (index > 0) {
      // 並列 PATCH は Notion の平均 3 req/s 制限を超えやすいため、更新間隔を空ける。
      await sleep(WRITE_INTERVAL_MS);
    }

    await applyAction(env.notion, action);
  }

  return {
    dailyCreated: created.dailyCreated,
    weekliesCreated: created.weekliesCreated,
    monthliesCreated: created.monthliesCreated,
    daysTransferred: transfer.daysTransferred,
    transferFallbacks: transfer.transferFallbackDates.length,
    transferFallbackDates: transfer.transferFallbackDates,
    monthlyDaysTransferred: monthlyTransfer.daysTransferred,
    monthlyTransferFallbacks:
      monthlyTransfer.transferFallbackDates.length,
    monthlyTransferFallbackDates:
      monthlyTransfer.transferFallbackDates,
    monthlyRefsGenerated: monthlyRefs.generated,
    monthlyRefsProcessed: monthlyRefs.processed,
    monthlyRefTitlesResolved: monthlyRefs.titleResolution.http,
    monthlyRefAnchorTitles: monthlyRefs.titleResolution.anchor,
    monthlyRefTitleFallbacks: monthlyRefs.titleResolution.fallback,
    renames: actions.filter(function (action) {
      return action.type === "rename";
    }).length,
    locks: actions.filter(function (action) {
      return action.type === "lock";
    }).length,
  };
}
