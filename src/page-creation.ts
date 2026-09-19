import { getJstDateKey } from "./date";
import { classifyPage } from "./page-classification";

export interface CreatedPage {
  readonly createdTime: string;
  readonly currentTitle: string;
  readonly isWeekly: boolean;
  readonly isMonthly?: boolean;
}

export function shouldCreateTodayPage(
  pages: readonly CreatedPage[],
  now: Date,
): boolean {
  const todayKey = getJstDateKey(now);
  const hasTodayPage = pages.some(function (page) {
    const classification = classifyPage(page, now);

    return (
      classification.kind === "daily" && classification.dateKey === todayKey
    );
  });

  return hasTodayPage === false;
}
