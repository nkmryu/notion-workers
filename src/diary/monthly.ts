import type { CalendarMonth } from "./calendar-month";
import type { PeriodDefinition } from "./period";

import { PERIOD_TYPE } from "./page";

import {
  compareCalendarMonths,
  formatCalendarMonthTitle,
  getJstCalendarMonth,
  parseCalendarMonthTitle,
} from "./calendar-month";

export const monthly: PeriodDefinition<CalendarMonth> = {
  type: PERIOD_TYPE.monthly,
  hasBeforeLockStep: true,
  keyOfDate: getJstCalendarMonth,
  compare: compareCalendarMonths,
  formatTitle: formatCalendarMonthTitle,
  parseTitle: parseCalendarMonthTitle,
  yearOf(month) {
    return month.year;
  },
};
