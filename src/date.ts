const TIME_ZONE = "Asia/Tokyo";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function getJstCalendarDate(date: Date): CalendarDate {
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(date)
      .filter(function (part) {
        return part.type !== "literal";
      })
      .map(function (part) {
        return [part.type, part.value];
      }),
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  if (![year, month, day].every(Number.isInteger)) {
    throw new Error(`JST の日付変換に失敗しました: ${date.toISOString()}`);
  }

  return { year, month, day };
}

export function getJstDateKey(date: Date): string {
  const { year, month, day } = getJstCalendarDate(date);

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function formatDailyTitle(date: Date): string {
  const { year, month, day } = getJstCalendarDate(date);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = WEEKDAYS[weekdayIndex];

  if (weekday === undefined) {
    throw new Error(`曜日の変換に失敗しました: ${date.toISOString()}`);
  }

  const shortYear = (year % 100).toString().padStart(2, "0");
  const paddedMonth = month.toString().padStart(2, "0");
  const paddedDay = day.toString().padStart(2, "0");

  return `${shortYear}.${paddedMonth}.${paddedDay}（${weekday}）`;
}
