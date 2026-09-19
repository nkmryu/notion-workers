import type { PageAction } from "../domain/page";
import type { DiaryRepository } from "../domain/diary-repository";

import { PAGE_ACTION_TYPE } from "../domain/page";
import { countBy, mapSequentially } from "../shared/sequence";

// ページ 1 件に対して決めた操作。
export interface PlannedPageAction {
  readonly pageId: string;
  readonly action: PageAction;
}

export interface PageActionCounts {
  readonly renames: number;
  readonly locks: number;
}

export function planPageActions(
  pageId: string,
  actions: readonly PageAction[],
): readonly PlannedPageAction[] {
  return actions.map(function (action) {
    return { pageId, action };
  });
}

function applyPageAction(diary: DiaryRepository, planned: PlannedPageAction): Promise<void> {
  return planned.action.type === PAGE_ACTION_TYPE.rename
    ? diary.renamePage(planned.pageId, planned.action.title)
    : diary.lockPage(planned.pageId);
}

export async function applyPageActions(
  diary: DiaryRepository,
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
