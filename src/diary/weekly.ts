import type { IsoWeek } from "./iso-week";
import type { PeriodDefinition } from "./period";

import { compareIsoWeeks, formatIsoWeekTitle, isoWeekOf, parseIsoWeekTitle } from "./iso-week";
import { PERIOD_TYPE } from "./page";

export const weekly: PeriodDefinition<IsoWeek> = {
  type: PERIOD_TYPE.weekly,
  hasBeforeLockStep: false,
  keyOf: isoWeekOf,
  compare: compareIsoWeeks,
  formatTitle: formatIsoWeekTitle,
  parseTitle: parseIsoWeekTitle,
  yearOf(week) {
    return week.year;
  },
};
