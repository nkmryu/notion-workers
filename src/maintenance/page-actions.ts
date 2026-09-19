import type { PageAction } from "../diary/page";
import type { DiaryStore } from "./diary-store";

import { PAGE_ACTION_TYPE } from "../diary/page";
import { countBy, mapSequentially } from "../shared/sequence";

// ページ 1 件に対して決めた操作。none は含めない。
export interface PlannedPageAction {
  readonly pageId: string;
  readonly action: Exclude<PageAction, { readonly type: typeof PAGE_ACTION_TYPE.none }>;
}

export interface PageActionCounts {
  readonly renames: number;
  readonly locks: number;
}

export function planPageAction(pageId: string, action: PageAction): readonly PlannedPageAction[] {
  return action.type === PAGE_ACTION_TYPE.none ? [] : [{ pageId, action }];
}

function applyPageAction(diary: DiaryStore, planned: PlannedPageAction): Promise<void> {
  return planned.action.type === PAGE_ACTION_TYPE.rename
    ? diary.renamePage(planned.pageId, planned.action.title)
    : diary.lockPage(planned.pageId);
}

export async function applyPageActions(
  diary: DiaryStore,
  planned: readonly PlannedPageAction[],
): Promise<PageActionCounts> {
  await mapSequentially(planned, function (item) {
    return applyPageAction(diary, item);
  });
  const counts = countBy(
    planned,
    function ({ action }) {
      return action.type;
    },
    [PAGE_ACTION_TYPE.rename, PAGE_ACTION_TYPE.lock],
  );

  return { renames: counts.rename, locks: counts.lock };
}
