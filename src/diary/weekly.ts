import type { IsoWeek } from "./iso-week";
import type { PeriodDefinition } from "./period";

import { PERIOD_TYPE } from "./page";

import {
  compareIsoWeeks,
  formatIsoWeekTitle,
  getJstIsoWeek,
  parseIsoWeekTitle,
} from "./iso-week";

export const weekly: PeriodDefinition<IsoWeek> = {
  type: PERIOD_TYPE.weekly,
  finalizesAfterLock: false,
  keyOfDate: getJstIsoWeek,
  compare: compareIsoWeeks,
  formatTitle: formatIsoWeekTitle,
  parseTitle: parseIsoWeekTitle,
  yearOf(week) {
    return week.year;
  },
};
