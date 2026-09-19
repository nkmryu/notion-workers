import { Temporal } from "temporal-polyfill";

export const JST_TIME_ZONE = "Asia/Tokyo";

// 日誌の日付は JST の暦日で決める。Notion の created_time や実行時刻は UTC の瞬間なので、ここで暦日へ落とす。
export function toJstDate(instant: Temporal.Instant): Temporal.PlainDate {
  return instant.toZonedDateTimeISO(JST_TIME_ZONE).toPlainDate();
}

export function jstDateOf(date: Date): Temporal.PlainDate {
  return toJstDate(Temporal.Instant.fromEpochMilliseconds(date.getTime()));
}

export function parseCreatedTime(createdTime: string): Temporal.PlainDate {
  try {
    return toJstDate(Temporal.Instant.from(createdTime));
  } catch {
    throw new Error(`created_time が不正です: ${createdTime}`);
  }
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
