import type { IsoWeek } from "./iso-week";
import type { PeriodDefinition } from "./period";

import {
  compareIsoWeeks,
  formatIsoWeekTitle,
  getJstIsoWeek,
  parseIsoWeekTitle,
} from "./iso-week";

export const weekly: PeriodDefinition<IsoWeek> = {
  type: "weekly",
  keyOfDate: getJstIsoWeek,
  compare: compareIsoWeeks,
  formatTitle: formatIsoWeekTitle,
  parseTitle: parseIsoWeekTitle,
  yearOf(week) {
    return week.year;
  },
};
