export const JST_TIME_ZONE = "Asia/Tokyo";
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: JST_TIME_ZONE,
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

// 日付キーは "2026-07-22" 形式。文字列比較がそのまま日付順になる。
export function getJstDateKey(date: Date): string {
  const { year, month, day } = getJstCalendarDate(date);

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function calendarDateToUtcDate(
  year: number,
  month: number,
  day: number,
  source: string,
): Date {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`日付が不正です: ${source}`);
  }

  return date;
}

export function dateKeyToDate(dateKey: string): Date {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  const [, yearText, monthText, dayText] = match ?? [];

  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined
  ) {
    throw new Error(`日付キーが不正です: ${dateKey}`);
  }

  return calendarDateToUtcDate(
    Number(yearText),
    Number(monthText),
    Number(dayText),
    dateKey,
  );
}

export function parseCreatedTime(createdTime: string): Date {
  const createdAt = new Date(createdTime);

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`created_time が不正です: ${createdTime}`);
  }

  return createdAt;
}

// "26" のような 2 桁年を、基準年に最も近い 4 桁年へ解決する。
export function resolveShortYear(shortYear: number, referenceYear: number): number {
  const century = Math.floor(referenceYear / 100) * 100;
  const candidates = [
    century - 100 + shortYear,
    century + shortYear,
    century + 100 + shortYear,
  ];

  return candidates.reduce(function (closest, candidate) {
    const closestDistance = Math.abs(closest - referenceYear);
    const candidateDistance = Math.abs(candidate - referenceYear);
    return candidateDistance < closestDistance ? candidate : closest;
  });
}
