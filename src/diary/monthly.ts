import type { PeriodDefinition } from "./period";

import { Temporal } from "temporal-polyfill";

import { formatCalendarMonthTitle, parseCalendarMonthTitle } from "./calendar-month";
import { PERIOD_TYPE } from "./page";

export const monthly: PeriodDefinition<Temporal.PlainYearMonth> = {
  type: PERIOD_TYPE.monthly,
  hasBeforeLockStep: true,
  keyOf(date) {
    return date.toPlainYearMonth();
  },
  compare(left, right) {
    return Temporal.PlainYearMonth.compare(left, right);
  },
  formatTitle: formatCalendarMonthTitle,
  parseTitle: parseCalendarMonthTitle,
  yearOf(month) {
    return month.year;
  },
};
