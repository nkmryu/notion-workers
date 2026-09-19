import type { CalendarMonth } from "./calendar-month";
import type { PeriodDefinition } from "./period";

import {
  compareCalendarMonths,
  formatCalendarMonthTitle,
  getJstCalendarMonth,
  parseCalendarMonthTitle,
} from "./calendar-month";

export const monthly: PeriodDefinition<CalendarMonth> = {
  type: "monthly",
  keyOfDate: getJstCalendarMonth,
  compare: compareCalendarMonths,
  formatTitle: formatCalendarMonthTitle,
  parseTitle: parseCalendarMonthTitle,
  yearOf(month) {
    return month.year;
  },
};
